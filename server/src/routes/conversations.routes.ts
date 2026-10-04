import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from './app.ts';
import type { Config } from './config.ts';
import { getAccountSignals } from './context.ts';
import { db } from './db/index.ts';
import {
  accounts,
  answerSources,
  answers,
  conversations,
  documentChunks,
  documentVersions,
  documents,
  employees,
  reviewedAnswers,
  turns,
} from './db/schema.ts';
import { notFound } from './errors.ts';
import { isoDate } from './lib/format.ts';
import {
  createConversation,
  generationLockHeld,
  regenerateConversation,
  replyConversation,
  type GenerateDeps,
} from './generate.ts';
import { editAnswer, reviewConversation, reviewedSourceChanged, reviewedSourceChangedByConversation, unsavedSourceUpdated } from './review.ts';
import { conversationStatesById, deriveState, STATE_FROM, STATE_SQL, STATES, topicsOf } from './state.ts';
import { rowsOf } from './db/rows.ts';

const questionBody = z.object({
  accountId: z.number().int().positive(),
  question: z.string().trim().min(1).max(2_000),
});
/** History returns the newest rows only; filters narrow the list before the limit. */
export const HISTORY_LIMIT = 200;

const idParam = z.object({ id: z.coerce.number().int().positive() });
// Empty and over-long replies are rejected by replyConversation (EMPTY_REPLY, REPLY_TOO_LONG).
const replyBody = z.object({
  selections: z.array(z.string().trim().min(1)).max(4).optional(),
  text: z.string().optional(),
});
const editBody = z.object({ editedText: z.string() });
const reviewBody = z.object({
  answerId: z.number().int().positive(),
  reviewAcknowledged: z.boolean().optional(),
});
const listQuery = z.object({
  accountId: z.coerce.number().int().positive().optional(),
  mine: z.enum(['0', '1']).default('1'),
  state: z.enum(STATES).optional(),
  signal: z.string().optional(),
  topic: z.string().optional(),
});

export function registerConversations(app: App, config: Config, deps: GenerateDeps = {}): void {
  app.post('/api/conversations', { schema: { body: questionBody } }, async (request, reply) => {
    const id = await createConversation({
      accountId: request.body.accountId,
      question: request.body.question,
      employeeId: request.employeeId!,
      config,
      deps,
      log: request.log,
    });
    return reply.status(201).send(await presentConversation(id, request.employeeId!));
  });

  app.post('/api/conversations/:id/regenerate', { schema: { params: idParam } }, async (request) => {
    const id = await regenerateConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      config,
      deps,
      log: request.log,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.post('/api/conversations/:id/replies', { schema: { params: idParam, body: replyBody } }, async (request) => {
    const id = await replyConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      selections: request.body.selections,
      text: request.body.text,
      config,
      deps,
      log: request.log,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.patch('/api/answers/:id', { schema: { params: idParam, body: editBody } }, async (request) => {
    const conversationId = await editAnswer({
      answerId: request.params.id,
      employeeId: request.employeeId!,
      editedText: request.body.editedText,
    });
    return presentConversation(conversationId, request.employeeId!);
  });

  app.post('/api/conversations/:id/review', { schema: { params: idParam, body: reviewBody } }, async (request) => {
    const id = await reviewConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      answerId: request.body.answerId,
      reviewAcknowledged: request.body.reviewAcknowledged,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.get('/api/conversations/:id', { schema: { params: idParam } }, async (request) => {
    return presentConversation(request.params.id, request.employeeId!);
  });

  app.get('/api/conversations', { schema: { querystring: listQuery } }, async (request) => {
    const { accountId, mine, state, signal, topic } = request.query;
    const filters = [];
    if (accountId) filters.push(sql`c.account_id = ${accountId}`);
    if (mine === '1') filters.push(sql`c.created_by = ${request.employeeId!}`);
    if (signal) {
      const withSignal = await accountsWithSignal(signal, filters);
      if (!withSignal.length) return { conversations: [] };
      filters.push(sql`c.account_id in (${sql.join(withSignal.map((id) => sql`${id}`), sql`, `)})`);
    }
    if (state) filters.push(sql`${STATE_SQL} = ${state}`);
    const where = filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
    // ponytail: topics are derived from cited sources in TS, so a topic filter runs over every
    // matching row before the limit. Move topicsOf into SQL if topic-filtered History gets slow.
    const limit = topic ? sql`` : sql`limit ${HISTORY_LIMIT}`;
    const ids = rowsOf(
      await db().execute(sql`select c.id from ${STATE_FROM} ${where} order by c.created_at desc, c.id desc ${limit}`),
    ).map((r) => Number(r.id));
    if (!ids.length) return { conversations: [] };

    const byId = new Map(
      (await db().select().from(conversations).where(inArray(conversations.id, ids))).map((r) => [r.id, r]),
    );
    const listed = await presentSummaries(ids.map((id) => byId.get(id)!), request.employeeId!);
    return {
      conversations: topic ? listed.filter((row) => row.topics.includes(topic)).slice(0, HISTORY_LIMIT) : listed,
    };
  });
}

export async function presentConversation(id: number, employeeId: number) {
  const [conv] = await db().select().from(conversations).where(eq(conversations.id, id));
  if (!conv) throw notFound('CONVERSATION_NOT_FOUND', 'No such conversation.');
  const [creator] = await db()
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.id, conv.createdBy));
  const turnRows = await db().select().from(turns).where(eq(turns.conversationId, id)).orderBy(turns.seq);
  const answerRows = await db().select().from(answers).where(eq(answers.conversationId, id)).orderBy(answers.id);
  const [reviewed] = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
  const latestByTurn = new Map<number, (typeof answerRows)[number]>();
  for (const a of answerRows) latestByTurn.set(a.turnId, a);

  const seqById = new Map(turnRows.map((t) => [t.id, t.seq]));
  const presented = [];
  for (const a of latestByTurn.values()) {
    presented.push(await presentAnswer(a, seqById.get(a.turnId)));
  }

  const lastTurn = turnRows[turnRows.length - 1];
  const latest = lastTurn ? latestByTurn.get(lastTurn.id) : undefined;
  const latestPresented = presented.find((a) => a.id === latest?.id);
  const state = deriveState({
    generating: generationLockHeld(conv),
    saved: !!reviewed,
    hasAnswer: !!latest,
    outcome: latest?.outcome,
    reviewReasons: (latest?.reviewReasons as string[]) ?? [],
  });
  const sourceChanged = reviewed ? await reviewedSourceChanged(reviewed.id) : false;
  const topics = reviewed ? reviewedTopics(reviewed, latest?.outcome) : (latestPresented?.topics ?? []);

  return {
    id: conv.id,
    accountId: conv.accountId,
    createdBy: creator,
    createdAt: conv.createdAt.toISOString(),
    ownedByMe: conv.createdBy === employeeId,
    state,
    flags: {
      sourceUpdated: !reviewed && (latestPresented?.sourceUpdated ?? false),
      sourceChanged,
    },
    topics,
    turns: turnRows.map((t) => ({
      id: t.id,
      seq: t.seq,
      kind: t.kind,
      text: t.text,
      selectedFacts: t.selectedFacts,
      at: t.createdAt.toISOString(),
    })),
    answers: presented,
    reviewed: reviewed
      ? { answerId: reviewed.answerId, text: reviewed.finalText, at: reviewed.reviewedAt.toISOString() }
      : null,
  };
}

// One query per table for the whole list, not per row.
async function presentSummaries(
  rows: (typeof conversations.$inferSelect)[],
  employeeId: number,
) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const [questions, latestAnswers, reviewed, creators, accountRows, sqlStates] = await Promise.all([
    db()
      .selectDistinctOn([turns.conversationId], { conversationId: turns.conversationId, text: turns.text })
      .from(turns)
      .where(and(inArray(turns.conversationId, ids), eq(turns.kind, 'question')))
      .orderBy(turns.conversationId, turns.seq),
    db()
      .selectDistinctOn([answers.conversationId])
      .from(answers)
      .where(inArray(answers.conversationId, ids))
      .orderBy(answers.conversationId, desc(answers.id)),
    db()
      .select()
      .from(reviewedAnswers)
      .where(inArray(reviewedAnswers.conversationId, ids)),
    db()
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, [...new Set(rows.map((r) => r.createdBy))])),
    db()
      .select({ id: accounts.id, ref: accounts.ref, companyName: accounts.companyName })
      .from(accounts)
      .where(inArray(accounts.id, accountIds)),
    conversationStatesById(ids),
  ]);

  const answerIds = latestAnswers.map((a) => a.id);
  const cited = answerIds.length
    ? await db()
        .select({ answerId: answerSources.answerId, category: documents.category })
        .from(answerSources)
        .innerJoin(documentChunks, eq(documentChunks.id, answerSources.chunkId))
        .innerJoin(documentVersions, eq(documentVersions.id, documentChunks.versionId))
        .innerJoin(documents, eq(documents.id, documentVersions.documentId))
        .where(and(inArray(answerSources.answerId, answerIds), isNotNull(answerSources.citationNumber)))
    : [];

  const [staleAnswers, staleReviewed] = await Promise.all([
    unsavedSourceUpdated(answerIds),
    reviewedSourceChangedByConversation(ids),
  ]);

  const questionBy = new Map(questions.map((q) => [q.conversationId, q.text]));
  const latestBy = new Map(latestAnswers.map((a) => [a.conversationId, a]));
  const reviewedBy = new Map(reviewed.map((r) => [r.conversationId, r]));
  const creatorBy = new Map(creators.map((e) => [e.id, e]));
  const accountBy = new Map(accountRows.map((a) => [a.id, a]));
  const categoriesBy = new Map<number, string[]>();
  for (const c of cited) categoriesBy.set(c.answerId, [...(categoriesBy.get(c.answerId) ?? []), c.category]);

  const signalsBy = new Map<number, Awaited<ReturnType<typeof getAccountSignals>>>();
  await Promise.all(
    accountIds.map(async (id) => {
      signalsBy.set(id, await getAccountSignals(id));
    }),
  );

  return rows.map((conv) => {
    const latest = latestBy.get(conv.id);
    const saved = reviewedBy.get(conv.id);
    const account = accountBy.get(conv.accountId);
    const topics = saved
      ? reviewedTopics(saved, latest?.outcome)
      : latest
        ? answerTopics(latest, categoriesBy.get(latest.id) ?? [])
        : [];
    return {
      id: conv.id,
      accountId: conv.accountId,
      accountRef: account?.ref ?? '',
      companyName: account?.companyName ?? '',
      question: questionBy.get(conv.id) ?? '',
      createdAt: conv.createdAt.toISOString(),
      createdBy: creatorBy.get(conv.createdBy)!,
      ownedByMe: conv.createdBy === employeeId,
      state: sqlStates.get(conv.id) ?? 'failed',
      flags: {
        sourceUpdated: !saved && !!latest && staleAnswers.has(latest.id),
        sourceChanged: !!saved && staleReviewed.has(conv.id),
      },
      topics,
      signals: signalsBy.get(conv.accountId) ?? [],
    };
  });
}

function reviewedTopics(saved: typeof reviewedAnswers.$inferSelect, outcome: string | undefined): string[] {
  const citedCategories = ((saved.sources as { category?: string | null }[]) ?? [])
    .map((s) => s.category)
    .filter((c): c is string => !!c);
  return topicsOf({ outcome, citedCategories, citedFacts: /\[F\d+\]/.test(saved.finalText) });
}

function answerTopics(answer: typeof answers.$inferSelect, citedCategories: string[]): string[] {
  const citedFacts = /\[F\d+\]/.test(answer.editedText ?? answer.answerText);
  return topicsOf({ outcome: answer.outcome, citedCategories, citedFacts });
}

async function presentAnswer(answer: typeof answers.$inferSelect, turnSeq: number | undefined) {
  const snapshot = answer.factsSnapshot as { as_of: string; facts: { id: string; record?: unknown }[]; empty: unknown[] };
  const facts = (snapshot.facts ?? []).map(({ record: _r, ...fact }) => fact);
  const sources = await db().execute(sql`
    select
      s.rank, s.score, s.citation_number, s.chunk_id,
      c.heading, c.page_number, c.text,
      v.id as version_id, v.version_number, v.effective_at,
      d.id as document_id, d.title, d.category, d.archived_at, d.active_version_id
    from answer_sources s
    left join document_chunks c on c.id = s.chunk_id
    left join document_versions v on v.id = c.version_id
    left join documents d on d.id = v.document_id
    where s.answer_id = ${answer.id}
    order by s.rank
  `);
  const cites: Record<string, ReturnType<typeof citeCard>> = {};
  const categories: string[] = [];
  let sourceUpdated = false;
  for (const row of rowsOf(sources)) {
    if (row.citation_number == null) continue;
    const card = citeCard(row);
    cites[card.n] = card;
    if (card.status) sourceUpdated = true;
    if (card.cat) categories.push(card.cat);
  }
  const clarifications = (answer.clarifications ?? []) as {
    kind: string;
    prompt?: string;
    question?: string;
    options?: { fact: string; label: string }[];
  }[];
  return {
    id: answer.id,
    turnId: answer.turnId,
    turnSeq,
    outcome: answer.outcome,
    text: answer.answerText,
    edited: answer.editedText,
    at: answer.createdAt.toISOString(),
    clarifications,
    questions: clarifications.map((c) =>
      c.kind === 'free_text' ? c.question : `${c.prompt} (${(c.options ?? []).map((o) => o.label).join(' / ')})`,
    ),
    gaps: answer.gaps,
    conflicts: answer.conflicts,
    reviewReasons: answer.reviewReasons,
    facts,
    empty: snapshot.empty ?? [],
    asOf: snapshot.as_of ?? answer.asOf,
    cites,
    sourceUpdated,
    topics: answerTopics(answer, categories),
    fallback: answer.model === 'stub-fallback',
    model: answer.model,
  };
}

function citeCard(row: Record<string, unknown>) {
  const n = String(row.citation_number);
  const chunkId = row.chunk_id == null ? null : Number(row.chunk_id);
  let status: 'Deleted' | 'Archived' | 'Superseded' | null = null;
  if (chunkId == null) status = 'Deleted';
  else if (row.archived_at) status = 'Archived';
  else if (row.active_version_id != null && Number(row.active_version_id) !== Number(row.version_id)) status = 'Superseded';
  return {
    n,
    docId: row.document_id == null ? null : Number(row.document_id),
    title: row.title == null ? 'Deleted source' : String(row.title),
    cat: row.category == null ? '' : String(row.category),
    v: row.version_number == null ? null : Number(row.version_number),
    eff: row.effective_at ? isoDate(String(row.effective_at)) : '',
    h: row.heading == null ? '' : String(row.heading),
    t: row.text == null ? '' : String(row.text),
    page: row.page_number == null ? null : Number(row.page_number),
    status,
  };
}

/** Accounts among the listed conversations that currently show `signal` (matched by key or label). */
async function accountsWithSignal(signal: string, filters: ReturnType<typeof sql>[]): Promise<number[]> {
  const where = filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
  const accountIds = rowsOf(await db().execute(sql`select distinct c.account_id from conversations c ${where}`)).map(
    (r) => Number(r.account_id),
  );
  const matches = await Promise.all(
    accountIds.map(async (id) => ((await getAccountSignals(id)).some((s) => s.key === signal || s.label === signal) ? id : null)),
  );
  return matches.filter((id): id is number => id != null);
}
