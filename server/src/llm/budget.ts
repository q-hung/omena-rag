import { and, eq, lt, sql } from 'drizzle-orm';
import { config as loadCached, type Config } from '../config/config.ts';
import { db } from '../db/index.ts';
import { budgetDays, CALL_KINDS, CALL_PURPOSES, providerCalls } from '../db/schema.ts';
import { budgetReached, generationQuota } from '../errors.ts';
import { utcToday } from '../lib/format.ts';
import { MAX_OUTPUT_TOKENS } from './gemini.ts';
import { ProviderError } from './errors.ts';

export const GENERATE_QUOTA = 50;
export const ABANDON_AFTER_MS = 10 * 60 * 1000;

export async function remainingBudgetUsd(cfg: Config = loadCached(), day = utcToday()): Promise<number> {
  const [row] = await db().select({ spent: budgetDays.spentUsd }).from(budgetDays).where(eq(budgetDays.day, day));
  return Math.max(0, cfg.DAILY_BUDGET_USD - Number(row?.spent ?? 0));
}

export type CallKind = (typeof CALL_KINDS)[number];
export type CallPurpose = (typeof CALL_PURPOSES)[number];

export type ReserveInput = {
  kind: CallKind;
  purpose: CallPurpose;
  attempt: number;
  model: string;
  inputChars: number;
  estimatedCostUsd?: number;
  employeeId?: number;
  conversationId?: number;
  documentVersionId?: number;
  day?: string;
};

export type Reservation = {
  id: number;
  day: string;
  kind: CallKind;
  estimatedCostUsd: number;
};

export type Usage = { inputTokens?: number; outputTokens?: number };

export function money(n: number): string {
  return (Math.round(n * 1e6) / 1e6).toFixed(6);
}

export function estimateTokens(kind: CallKind, inputChars: number) {
  return {
    inputTokens: Math.ceil(Math.max(0, inputChars) / 3),
    outputTokens: kind === 'generate' ? MAX_OUTPUT_TOKENS : 0,
  };
}

export function costUsd(kind: CallKind, tokens: { inputTokens: number; outputTokens: number }, cfg: Config): number {
  const inPrice = kind === 'generate' ? cfg.PRICE_GENERATION_INPUT_USD_PER_MTOK : cfg.PRICE_EMBEDDING_INPUT_USD_PER_MTOK;
  const outPrice = kind === 'generate' ? cfg.PRICE_GENERATION_OUTPUT_USD_PER_MTOK : 0;
  return tokens.inputTokens * (inPrice / 1e6) + tokens.outputTokens * (outPrice / 1e6);
}

export function estimateCostUsd(kind: CallKind, inputChars: number, cfg: Config): number {
  return costUsd(kind, estimateTokens(kind, inputChars), cfg);
}

export async function reserve(input: ReserveInput, cfg: Config = loadCached()): Promise<Reservation> {
  const day = input.day ?? utcToday();
  const estimatedCostUsd = input.estimatedCostUsd ?? estimateCostUsd(input.kind, input.inputChars, cfg);
  if (estimatedCostUsd > cfg.DAILY_BUDGET_USD) throw budgetReached();

  return db().transaction(async (tx) => {
    if (input.kind === 'generate' && input.attempt === 1 && input.employeeId) {
      const start = `${day}T00:00:00.000Z`;
      const end = `${nextUtcDay(day)}T00:00:00.000Z`;
      const counted = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(providerCalls)
        .where(
          sql`${providerCalls.employeeId} = ${input.employeeId}
            and ${providerCalls.kind} = 'generate'
            and ${providerCalls.attempt} = 1
            and ${providerCalls.createdAt} >= ${start}::timestamptz
            and ${providerCalls.createdAt} < ${end}::timestamptz`,
        );
      if ((counted[0]?.n ?? 0) >= GENERATE_QUOTA) throw generationQuota();
    }

    const upserted = await tx.execute(sql`
      insert into budget_days (day, spent_usd) values (${day}::date, ${money(estimatedCostUsd)}::numeric)
      on conflict (day) do update
        set spent_usd = budget_days.spent_usd + excluded.spent_usd
      where budget_days.spent_usd + excluded.spent_usd <= ${money(cfg.DAILY_BUDGET_USD)}::numeric
      returning spent_usd
    `);
    if (rowsOf(upserted).length === 0) throw budgetReached();

    const [row] = await tx
      .insert(providerCalls)
      .values({
        kind: input.kind,
        purpose: input.purpose,
        attempt: input.attempt,
        model: input.model,
        employeeId: input.employeeId,
        conversationId: input.conversationId,
        documentVersionId: input.documentVersionId,
        status: 'reserved',
        estimatedCostUsd: money(estimatedCostUsd),
      })
      .returning({ id: providerCalls.id });

    return { id: row!.id, day, kind: input.kind, estimatedCostUsd };
  });
}

export async function reconcile(
  reservation: Reservation,
  result: { status: 'ok' | 'error'; errorCode?: string; usage?: Usage; latencyMs?: number; requestId?: string },
  cfg: Config = loadCached(),
): Promise<void> {
  await db().transaction(async (tx) => {
    const [call] = await tx.select().from(providerCalls).where(eq(providerCalls.id, reservation.id));
    if (!call || call.status !== 'reserved') return;

    const known = result.usage && (result.usage.inputTokens != null || result.usage.outputTokens != null);
    const actual = known
      ? costUsd(
          reservation.kind,
          {
            inputTokens: result.usage!.inputTokens ?? 0,
            outputTokens: result.usage!.outputTokens ?? 0,
          },
          cfg,
        )
      : undefined;

    await tx
      .update(providerCalls)
      .set({
        status: result.status,
        errorCode: result.errorCode,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        costUsd: actual === undefined ? null : money(actual),
        latencyMs: result.latencyMs,
        requestId: result.requestId,
      })
      .where(eq(providerCalls.id, reservation.id));

    if (actual !== undefined) {
      const delta = money(actual - reservation.estimatedCostUsd);
      await tx.execute(sql`
        update budget_days
        set spent_usd = spent_usd + ${delta}::numeric
        where day = ${reservation.day}::date
      `);
    }
  });
}

export async function paidAttempt<T>(
  input: ReserveInput,
  fn: () => Promise<{ value: T; usage?: Usage; requestId?: string }>,
  cfg: Config = loadCached(),
): Promise<T> {
  const reservation = await reserve(input, cfg);
  const started = Date.now();
  try {
    const result = await fn();
    await reconcile(reservation, {
      status: 'ok',
      usage: result.usage,
      requestId: result.requestId,
      latencyMs: Date.now() - started,
    }, cfg);
    return result.value;
  } catch (error) {
    await reconcile(reservation, {
      status: 'error',
      errorCode: error instanceof ProviderError ? error.code : 'ERROR',
      latencyMs: Date.now() - started,
    }, cfg);
    throw error;
  }
}

/** COST-04: reserved rows older than 10 minutes become error/abandoned. Budget is unchanged. */
export async function sweepAbandonedReservations(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - ABANDON_AFTER_MS);
  const rows = await db()
    .update(providerCalls)
    .set({ status: 'error', errorCode: 'abandoned' })
    .where(and(eq(providerCalls.status, 'reserved'), lt(providerCalls.createdAt, cutoff)))
    .returning({ id: providerCalls.id });
  return rows.length;
}

function nextUtcDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result) return (result as { rows: unknown[] }).rows;
  return [];
}
