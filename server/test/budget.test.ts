import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { db } from '../src/db/index.ts';
import { budgetDays, providerCalls } from '../src/db/schema.ts';
import { ProviderError } from '../src/llm/errors.ts';
import {
  GENERATE_QUOTA,
  estimateCostUsd,
  money,
  paidAttempt,
  reconcile,
  reserve,
  sweepAbandonedReservations,
} from '../src/llm/budget.ts';
import { utcToday } from '../src/lib/format.ts';
import { seedEmployees } from '../src/seed.ts';

const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  DAILY_BUDGET_USD: '5',
};
const cfg = loadConfig(env);
const tight = loadConfig({ ...env, DAILY_BUDGET_USD: '0.01' });

let employeeId: number;
let otherId: number;

beforeAll(async () => {
  const [ada, rei] = await seedEmployees(db(), 'test-password');
  employeeId = ada!.id;
  otherId = rei!.id;
});

const base = {
  purpose: 'app' as const,
  model: 'stub',
  inputChars: 0,
  employeeId: 0,
};

describe.sequential('budget', () => {
  it('lets exactly one of two concurrent $0.008 reservations through when $0.01 remains', async () => {
    const results = await Promise.allSettled([
      reserve({ ...base, kind: 'embed_query', attempt: 1, employeeId, estimatedCostUsd: 0.008 }, tight),
      reserve({ ...base, kind: 'embed_query', attempt: 1, employeeId, estimatedCostUsd: 0.008 }, tight),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { statusCode: 429, code: 'budget_reached' } });
    expect(await spent()).toBe('0.008000');
  });

  it('creates one provider_calls row per retry attempt', async () => {
    let attempts = 0;
    const run = (attempt: number) =>
      paidAttempt({ ...base, kind: 'generate', attempt, employeeId, inputChars: 9 }, async () => {
        attempts += 1;
        if (attempts < 3) throw new ProviderError('HTTP_500', 'fail', true);
        return { value: 'ok', usage: { inputTokens: 3, outputTokens: 10 } };
      }, cfg);

    await expect(run(1)).rejects.toMatchObject({ code: 'HTTP_500' });
    await expect(run(2)).rejects.toMatchObject({ code: 'HTTP_500' });
    await expect(run(3)).resolves.toBe('ok');

    const rows = await db()
      .select()
      .from(providerCalls)
      .where(eq(providerCalls.employeeId, employeeId))
      .orderBy(providerCalls.attempt);
    const retries = rows.filter((r) => r.kind === 'generate' && r.model === 'stub');
    expect(retries.map((r) => [r.attempt, r.status])).toEqual([
      [1, 'error'],
      [2, 'error'],
      [3, 'ok'],
    ]);
    expect(retries.every((r) => r.estimatedCostUsd && !('prompt' in r) && !('response' in r))).toBe(true);
  });

  it('keeps the estimate charged when usage is unknown after a timeout', async () => {
    const reservation = await reserve(
      { ...base, kind: 'generate', attempt: 1, employeeId: otherId, estimatedCostUsd: 0.008 },
      cfg,
    );
    const before = await spent();
    await reconcile(reservation, { status: 'error', errorCode: 'TIMEOUT' }, cfg);
    expect(await spent()).toBe(before);
    const [row] = await db().select().from(providerCalls).where(eq(providerCalls.id, reservation.id));
    expect(row).toMatchObject({ status: 'error', errorCode: 'TIMEOUT', costUsd: null });
  });

  it('rejects the 51st first-attempt generate for an employee', async () => {
    await db().insert(providerCalls).values(
      Array.from({ length: GENERATE_QUOTA }, () => ({
        kind: 'generate' as const,
        purpose: 'app' as const,
        attempt: 1,
        model: 'quota',
        employeeId,
        status: 'ok' as const,
        estimatedCostUsd: '0.000001',
      })),
    );
    await expect(
      reserve({ ...base, kind: 'generate', attempt: 1, employeeId, inputChars: 3 }, cfg),
    ).rejects.toMatchObject({ statusCode: 429, code: 'GENERATION_QUOTA' });
    await expect(
      reserve({ ...base, kind: 'generate', attempt: 1, employeeId: otherId, inputChars: 3 }, cfg),
    ).resolves.toMatchObject({ kind: 'generate' });
  });

  it('marks a 15-minute-old reservation abandoned without changing spend', async () => {
    const reservation = await reserve(
      { ...base, kind: 'embed_document', attempt: 1, employeeId: otherId, estimatedCostUsd: 0.001 },
      cfg,
    );
    await db()
      .update(providerCalls)
      .set({ createdAt: new Date(Date.now() - 15 * 60 * 1000) })
      .where(eq(providerCalls.id, reservation.id));
    const before = await spent();
    expect(await sweepAbandonedReservations()).toBeGreaterThanOrEqual(1);
    expect(await spent()).toBe(before);
    const [row] = await db().select().from(providerCalls).where(eq(providerCalls.id, reservation.id));
    expect(row).toMatchObject({ status: 'error', errorCode: 'abandoned' });
  });

  it('estimates input as ceil(chars/3) and generate output as maxOutputTokens', () => {
    expect(estimateCostUsd('embed_query', 10, cfg)).toBeCloseTo(4 * (cfg.PRICE_EMBEDDING_INPUT_USD_PER_MTOK / 1e6), 8);
    expect(estimateCostUsd('generate', 1, cfg)).toBeCloseTo(
      1 * (cfg.PRICE_GENERATION_INPUT_USD_PER_MTOK / 1e6) + 2048 * (cfg.PRICE_GENERATION_OUTPUT_USD_PER_MTOK / 1e6),
      8,
    );
  });
});

async function spent(): Promise<string> {
  const [row] = await db().select().from(budgetDays).where(eq(budgetDays.day, utcToday()));
  return row ? money(Number(row.spentUsd)) : '0.000000';
}
