import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.ts';
import { buildAccountSnapshot, type AccountSnapshot } from './context.ts';
import { db } from './db/index.ts';
import {
  accounts,
  answers,
  conversations,
  documentVersions,
  documents,
  providerCalls,
  turns,
} from './db/schema.ts';
import {
  AppError,
  badRequest,
  conflict,
  generationQuota,
  notFound,
  notOwner,
} from './errors.ts';
import { GENERATE_QUOTA, money, paidAttempt } from './llm/budget.ts';
import { ProviderError, isRetryable } from './llm/errors.ts';
import { formatQueryForEmbedding } from './llm/format.ts';
import { createProvider } from './llm/provider.ts';
import { MAX_RETRIES } from './llm/retry.ts';
import type { GenerateInput, Provider } from './llm/types.ts';
import { utcToday } from './lib/format.ts';
import { normalise, type Normalised } from './normalise.ts';
import { buildPrompt, type PromptTurn } from './prompt.ts';
import { retrieve, type Passage } from './retrieve.ts';
import { lockHeld } from './state.ts';
import { rowsOf } from './upload.ts';

export const REQUEST_DEADLINE_MS = 90_000;

export type GenerateDeps = {
  provider?: Provider;
  retrieve?: typeof retrieve;
  afterRetrieve?: (passages: Passage[]) => Promise<void>;
  afterT2Lock?: () => Promise<void>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  requestDeadlineMs?: number;
};

export function requireOwner(conversation: { createdBy: number }, employeeId: number): void {
  if (conversation.createdBy !== employeeId) throw notOwner();
}

export async function createConversation(input: {
  accountId: number;
  question: string;
  employeeId: number;
  config: Config;
  deps?: GenerateDeps;
  log?: FastifyBaseLogger;
}) {
  const token = randomUUID();
  const [account] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, input.accountId));
  if (!account) throw notFound('ACCOUNT_NOT_FOUND', 'No such account.');

  const started = await db().transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({ accountId: input.accountId, createdBy: input.employeeId })
      .returning();
    await tx.execute(sql`select id from conversations where id = ${conv!.id} for update`);
    await assertQuota(tx, input.employeeId);
    await takeLock(tx, conv!.id, token);
    const [turn] = await tx
      .insert(turns)
      .values({
        conversationId: conv!.id,
        seq: 1,
        kind: 'question',
        text: input.question,
        createdBy: input.employeeId,
      })
      .returning();
    return { conversationId: conv!.id, turnId: turn!.id, token };
  });

  return finish(started, input);
}

export async function regenerateConversation(input: {
  conversationId: number;
  employeeId: number;
  config: Config;
  deps?: GenerateDeps;
  log?: FastifyBaseLogger;
}) {
  const token = randomUUID();
  const started = await db().transaction(async (tx) => {
    const [conv] = rowsOf(
      await tx.execute(sql`select * from conversations where id = ${input.conversationId} for update`),
    );
    if (!conv) throw notFound('CONVERSATION_NOT_FOUND', 'No such conversation.');
    requireOwner({ createdBy: Number(conv.created_by) }, input.employeeId);
    await assertNotSaved(tx, input.conversationId);
    await assertQuota(tx, input.employeeId);
    if (!rowsOf(await takeLock(tx, input.conversationId, token)).length) {
      throw conflict('GENERATION_IN_PROGRESS', 'This conversation is already generating an answer.');
    }
    const [turn] = await tx
      .select()
      .from(turns)
      .where(eq(turns.conversationId, input.conversationId))
      .orderBy(desc(turns.seq))
      .limit(1);
    if (!turn) throw notFound('TURN_NOT_FOUND', 'This conversation has no question yet.');
    return { conversationId: input.conversationId, turnId: turn.id, token };
  });

  return finish(started, input);
}

export async function replyConversation(input: {
  conversationId: number;
  employeeId: number;
  selections?: string[];
  text?: string;
  config: Config;
  deps?: GenerateDeps;
  log?: FastifyBaseLogger;
}) {
  const selections = [...new Set((input.selections ?? []).map((id) => id.trim()).filter(Boolean))];
  const text = input.text?.trim() || null;
  if (!selections.length && !text) throw badRequest('EMPTY_REPLY', 'Select a record or enter a reply.');
  if (text && text.length > 1_000) throw badRequest('REPLY_TOO_LONG', 'A reply can be at most 1,000 characters.');

  const token = randomUUID();
  const started = await db().transaction(async (tx) => {
    const [conv] = rowsOf(
      await tx.execute(sql`select * from conversations where id = ${input.conversationId} for update`),
    );
    if (!conv) throw notFound('CONVERSATION_NOT_FOUND', 'No such conversation.');
    requireOwner({ createdBy: Number(conv.created_by) }, input.employeeId);
    await assertNotSaved(tx, input.conversationId);

    const [lastTurn] = await tx
      .select()
      .from(turns)
      .where(eq(turns.conversationId, input.conversationId))
      .orderBy(desc(turns.seq))
      .limit(1);
    const [latest] = lastTurn
      ? await tx.select().from(answers).where(eq(answers.turnId, lastTurn.id)).orderBy(desc(answers.id)).limit(1)
      : [];
    if (latest?.outcome !== 'clarification_required') {
      throw conflict('NOT_AWAITING_CLARIFICATION', 'Reply only when Jarvis has asked for clarification.');
    }
    const selected = validateSelections(selections, latest.clarifications);
    await assertQuota(tx, input.employeeId);
    if (!rowsOf(await takeLock(tx, input.conversationId, token)).length) {
      throw conflict('GENERATION_IN_PROGRESS', 'This conversation is already generating an answer.');
    }
    const [turn] = await tx
      .insert(turns)
      .values({
        conversationId: input.conversationId,
        seq: lastTurn!.seq + 1,
        kind: 'clarification_reply',
        text,
        selectedFacts: selected.length ? selected : null,
        createdBy: input.employeeId,
      })
      .returning();
    return { conversationId: input.conversationId, turnId: turn!.id, token };
  });

  return finish(started, input);
}

async function finish(
  started: { conversationId: number; turnId: number; token: string },
  input: { employeeId: number; config: Config; deps?: GenerateDeps; log?: FastifyBaseLogger },
): Promise<number> {
  const now = input.deps?.now ?? Date.now;
  const deadline = now() + (input.deps?.requestDeadlineMs ?? REQUEST_DEADLINE_MS);
  try {
    await runOutsideTxn(started, input, deadline);
  } catch (error) {
    // Provider and app errors are expected outcomes; anything else is a bug that would
    // otherwise surface only as state `failed`.
    if (!(error instanceof AppError) && !(error instanceof ProviderError)) {
      const err = error as Error;
      // SEC-11: message and stack only, never the error object (pg errors carry row data).
      input.log?.error(
        { code: 'ERROR', conversationId: started.conversationId, err: err?.message, stack: err?.stack },
        'generation failed unexpectedly',
      );
    }
    await clearLock(started.conversationId, started.token);
    await recordFailure(started.conversationId, input.employeeId, input.config, error);
    if (error instanceof AppError && error.code === 'account_data_unavailable') {
      throw new AppError(503, error.code, error.message, { conversationId: started.conversationId, cause: error });
    }
    if (error instanceof AppError) throw error;
  }
  return started.conversationId;
}

async function runOutsideTxn(
  started: { conversationId: number; turnId: number; token: string },
  input: { employeeId: number; config: Config; deps?: GenerateDeps },
  deadline: number,
): Promise<void> {
  const cfg = input.config;
  const deps = input.deps ?? {};
  const now = deps.now ?? Date.now;
  const provider = deps.provider ?? createProvider(cfg);
  const search = deps.retrieve ?? retrieve;

  const [conv] = await db().select().from(conversations).where(eq(conversations.id, started.conversationId));
  const turnRows = await db()
    .select()
    .from(turns)
    .where(eq(turns.conversationId, started.conversationId))
    .orderBy(turns.seq);
  const priorAnswers = await db()
    .select()
    .from(answers)
    .where(eq(answers.conversationId, started.conversationId))
    .orderBy(desc(answers.id));

  let snapshot: AccountSnapshot;
  try {
    snapshot = await buildAccountSnapshot(conv!.accountId, utcToday());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'account_data_unavailable', 'Account data could not be loaded. Try again.', {
      cause: error,
    });
  }

  const query = retrievalQuery(turnRows, snapshot.facts);
  if (now() >= deadline) throw new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.');
  const formatted = formatQueryForEmbedding(query);
  const vector = await paidAttempt(
    {
      kind: 'embed_query',
      purpose: 'app',
      attempt: 1,
      model: cfg.EMBEDDING_MODEL,
      inputChars: formatted.length,
      employeeId: input.employeeId,
      conversationId: started.conversationId,
    },
    async () => {
      const result = await provider.embedQuery(query, deadline);
      return { value: result.vectors[0]!, usage: undefined };
    },
    cfg,
  );

  const passages = await search(vector, {
    model: cfg.EMBEDDING_MODEL,
    minScore: cfg.LLM_PROVIDER === 'stub' ? 0 : cfg.RETRIEVAL_MIN_SCORE,
    lexicalQuery: cfg.LLM_PROVIDER === 'stub' ? query : undefined,
  });
  await deps.afterRetrieve?.(passages);

  const promptTurns: PromptTurn[] = turnRows.map((t) => ({
    kind: t.kind as PromptTurn['kind'],
    text: t.text,
    selectedFacts: t.selectedFacts,
    clarifications: clarificationsFor(priorAnswers, t.id),
  }));
  const built = buildPrompt({
    snapshot,
    passages,
    turns: promptTurns,
    question: turnRows[turnRows.length - 1]?.text ?? query,
  });

  const previous = priorAnswers.find((a) => a.turnId !== started.turnId);
  const generated = await paidGenerate(
    provider,
    {
      prompt: built.prompt,
      question: query,
      accountId: conv!.accountId,
      previousScriptId: previous?.model.startsWith('stub:') ? previous.model.slice(5) : undefined,
      refundV3: await isRefundV3(),
      once: true,
    },
    deadline,
    { employeeId: input.employeeId, conversationId: started.conversationId, now, sleep: deps.sleep },
    cfg,
  );

  const rounds = turnRows.filter((t) => t.kind === 'clarification_reply').length;
  const normalised = normalise(generated.output, {
    facts: snapshot.facts,
    passages: built.passages,
    clarificationRounds: rounds,
  });

  await saveAnswer({
    started,
    employeeId: input.employeeId,
    snapshot,
    normalised,
    model: generated.model,
    promptVersion: built.promptVersion,
    deps,
  });
}

async function paidGenerate(
  provider: Provider,
  input: GenerateInput,
  deadline: number,
  opts: { employeeId: number; conversationId: number; now: () => number; sleep?: (ms: number) => Promise<void> },
  cfg: Config,
) {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (opts.now() >= deadline) {
      throw last instanceof ProviderError
        ? last
        : new ProviderError('DEADLINE', 'The request deadline passed before a new attempt could start.');
    }
    try {
      return await paidAttempt(
        {
          kind: 'generate',
          purpose: 'app',
          attempt,
          model: cfg.GENERATION_MODEL,
          inputChars: input.prompt.length,
          employeeId: opts.employeeId,
          conversationId: opts.conversationId,
        },
        async () => {
          const result = await provider.generate(input, deadline);
          return { value: result, usage: result.usage };
        },
        cfg,
      );
    } catch (error) {
      last = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES + 1) throw error;
      const wait = Math.min(8_000, 200 * 2 ** (attempt - 1)) * (0.5 + Math.random());
      if (opts.now() + wait >= deadline) throw error;
      await sleep(wait);
    }
  }
  throw last;
}

async function saveAnswer(input: {
  started: { conversationId: number; turnId: number; token: string };
  employeeId: number;
  snapshot: AccountSnapshot;
  normalised: Normalised;
  model: string;
  promptVersion: string;
  deps?: GenerateDeps;
}): Promise<void> {
  const { started, normalised } = input;
  await db().transaction(async (tx) => {
    const [conv] = rowsOf(
      await tx.execute(sql`select generation_token from conversations where id = ${started.conversationId} for update`),
    );
    await input.deps?.afterT2Lock?.();
    if (!conv || String(conv.generation_token) !== started.token) {
      throw conflict('LOCK_TAKEN', 'The generation lock was taken over.');
    }
    const [answer] = await tx
      .insert(answers)
      .values({
        conversationId: started.conversationId,
        turnId: started.turnId,
        createdBy: input.employeeId,
        outcome: normalised.outcome,
        answerText: normalised.text,
        clarifications: normalised.clarifications,
        gaps: normalised.gaps,
        conflicts: normalised.conflicts,
        reviewReasons: normalised.reviewReasons,
        factsSnapshot: input.snapshot,
        asOf: input.snapshot.as_of,
        model: input.model,
        promptVersion: input.promptVersion,
      })
      .returning({ id: answers.id });

    for (const src of normalised.sources) {
      await tx.execute(sql`
        insert into answer_sources (answer_id, rank, chunk_id, score, citation_number)
        values (
          ${answer!.id},
          ${src.rank},
          (select id from document_chunks where id = ${src.chunkId}),
          ${src.score},
          ${src.citationNumber}
        )
      `);
    }

    await tx
      .update(conversations)
      .set({ generationToken: null, generationStartedAt: null })
      .where(and(eq(conversations.id, started.conversationId), eq(conversations.generationToken, started.token)));
  });
}

async function takeLock(tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, id: number, token: string) {
  return tx.execute(sql`
    update conversations
    set generation_token = ${token}::uuid, generation_started_at = now()
    where id = ${id}
      and (generation_token is null or generation_started_at < now() - interval '2 minutes')
    returning id
  `);
}

async function clearLock(conversationId: number, token: string): Promise<void> {
  await db()
    .update(conversations)
    .set({ generationToken: null, generationStartedAt: null })
    .where(and(eq(conversations.id, conversationId), eq(conversations.generationToken, token)));
}

async function assertQuota(tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, employeeId: number) {
  const day = utcToday();
  const start = `${day}T00:00:00.000Z`;
  const end = `${nextUtcDay(day)}T00:00:00.000Z`;
  const counted = await tx.execute(sql`
    select count(*)::int as n
    from provider_calls
    where employee_id = ${employeeId}
      and kind = 'generate'
      and attempt = 1
      and created_at >= ${start}::timestamptz
      and created_at < ${end}::timestamptz
  `);
  const n = Number(rowsOf(counted)[0]?.n ?? 0);
  if (n >= GENERATE_QUOTA) throw generationQuota();
}

async function recordFailure(conversationId: number, employeeId: number, cfg: Config, error: unknown): Promise<void> {
  if (error instanceof AppError && error.code === 'LOCK_TAKEN') return;
  const code =
    error instanceof ProviderError
      ? error.code
      : error instanceof AppError
        ? error.code
        : 'ERROR';
  // GEN-03 failure marker. attempt 0 keeps it out of the quota, which counts attempt 1
  // only; a failed provider attempt already has its own row from paidAttempt.
  await db().insert(providerCalls).values({
    kind: 'generate',
    purpose: 'app',
    attempt: 0,
    model: cfg.GENERATION_MODEL,
    employeeId,
    conversationId,
    status: 'error',
    estimatedCostUsd: money(0),
    errorCode: code,
  });
}

function retrievalQuery(
  turnRows: { kind: string; text: string | null; selectedFacts?: string[] | null }[],
  facts: { id: string; value: string }[],
): string {
  const first = turnRows.find((t) => t.kind === 'question')?.text ?? '';
  const last = turnRows[turnRows.length - 1];
  const extra = last && last.kind !== 'question' ? last.text : '';
  const byId = new Map(facts.map((f) => [f.id, f.value]));
  const selected = (last?.selectedFacts ?? []).map((id) => `${id} ${byId.get(id) ?? ''}`).join(' ');
  return [first, extra, selected].filter((s) => s && s.trim()).join('\n').slice(0, 3_000);
}

function validateSelections(ids: string[], raw: unknown): string[] {
  const clarifications = (raw ?? []) as { kind: string; options?: { fact: string }[] }[];
  const choose = clarifications.filter((c) => c.kind === 'choose_record');
  const allowed = new Map<string, number>();
  choose.forEach((c, i) => {
    for (const option of c.options ?? []) allowed.set(option.fact, i);
  });
  const used = new Set<number>();
  for (const id of ids) {
    const index = allowed.get(id);
    if (index == null) throw badRequest('INVALID_SELECTION', `${id} is not an option of the current clarification.`);
    if (used.has(index)) throw badRequest('INVALID_SELECTION', 'Select at most one option per clarification.');
    used.add(index);
  }
  return ids;
}

async function assertNotSaved(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  conversationId: number,
) {
  const existing = rowsOf(
    await tx.execute(sql`select id from reviewed_answers where conversation_id = ${conversationId}`),
  );
  if (existing.length) throw conflict('ALREADY_SAVED', 'This conversation is already saved.');
}

function clarificationsFor(prior: { turnId: number; clarifications: unknown }[], turnId: number) {
  const answer = prior.find((a) => a.turnId === turnId);
  return (answer?.clarifications as PromptTurn['clarifications']) ?? [];
}

async function isRefundV3(): Promise<boolean> {
  const [row] = await db()
    .select({ n: documentVersions.versionNumber })
    .from(documents)
    .innerJoin(documentVersions, eq(documents.activeVersionId, documentVersions.id))
    .where(eq(documents.title, 'Refund policy'));
  return (row?.n ?? 0) >= 3;
}

function nextUtcDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function generationLockHeld(row: { generationToken: string | null; generationStartedAt: Date | null }, now = Date.now()) {
  return !!row.generationToken && lockHeld(row.generationStartedAt, now);
}
