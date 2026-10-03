import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from './app.ts';
import type { Config } from './config.ts';
import { getAccountSignals } from './context.ts';
import { db } from './db/index.ts';
import {
  answers,
  conversations,
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
  type GenerateDeps,
} from './generate.ts';
import { deriveState, topicsOf } from './state.ts';
import { rowsOf } from './upload.ts';

const questionBody = z.object({
  accountId: z.number().int().positive(),
  question: z.string().trim().min(1).max(2_000),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function registerConversations(app: App, config: Config, deps: GenerateDeps = {}): void {
  app.post('/api/conversations', { schema: { body: questionBody } }, async (request, reply) => {
    const id = await createConversation({
      accountId: request.body.accountId,
      question: request.body.question,
      employeeId: request.employeeId!,
      config,
      deps,
    });
    return reply.status(201).send(await presentConversation(id, request.employeeId!));
  });

  app.post('/api/conversations/:id/regenerate', { schema: { params: idParam } }, async (request) => {
    const id = await regenerateConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      config,
      deps,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.get('/api/conversations/:id', { schema: { params: idParam } }, async (request) => {
    return presentConversation(request.params.id, request.employeeId!);
  });

  app.get(
    '/api/conversations',
    {
      schema: {
        querystring: z.object({
          accountId: z.coerce.number().int().positive(),
          mine: z.enum(['0', '1']).default('1'),
        }),
      },
    },
    async (request) => {
      const { accountId, mine } = request.query;
      const where =
        mine === '1'
          ? and(eq(conversations.accountId, accountId), eq(conversations.createdBy, request.employeeId!))
          : eq(conversations.accountId, accountId);
      const rows = await db().select().from(conversations).where(where).orderBy(desc(conversations.createdAt));
      const signals = await getAccountSignals(accountId);
      return {
        conversations: await Promise.all(rows.map((row) => presentSummary(row, request.employeeId!, signals))),
      };
    },
  );
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

  const presented = [];
  for (const a of latestByTurn.values()) {
    presented.push(await presentAnswer(a));
  }

  const lastTurn = turnRows[turnRows.length - 1];
  const latest = lastTurn ? latestByTurn.get(lastTurn.id) : undefined;
  const latestPresented = presented.find((a) => a.id === latest?.id);
  const generating = generationLockHeld(conv);
  const state = deriveState({
    generating,
    saved: !!reviewed,
    hasAnswer: !!latest,
    outcome: latest?.outcome,
    reviewReasons: (latest?.reviewReasons as string[]) ?? [],
  });

  return {
    id: conv.id,
    accountId: conv.accountId,
    createdBy: creator,
    createdAt: conv.createdAt.toISOString(),
    ownedByMe: conv.createdBy === employeeId,
    state,
    flags: { sourceUpdated: latestPresented?.sourceUpdated ?? false },
    topics: latestPresented?.topics ?? [],
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

async function presentSummary(
  conv: typeof conversations.$inferSelect,
  employeeId: number,
  signals: Awaited<ReturnType<typeof getAccountSignals>>,
) {
  const [question] = await db()
    .select()
    .from(turns)
    .where(and(eq(turns.conversationId, conv.id), eq(turns.kind, 'question')))
    .orderBy(turns.seq)
    .limit(1);
  const [latest] = await db()
    .select()
    .from(answers)
    .where(eq(answers.conversationId, conv.id))
    .orderBy(desc(answers.id))
    .limit(1);
  const [reviewed] = await db().select({ id: reviewedAnswers.id }).from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, conv.id));
  const presented = latest ? await presentAnswer(latest) : null;
  const lastTurn = await db()
    .select({ id: turns.id })
    .from(turns)
    .where(eq(turns.conversationId, conv.id))
    .orderBy(desc(turns.seq))
    .limit(1);
  const hasAnswer = !!(latest && lastTurn[0] && latest.turnId === lastTurn[0].id);
  return {
    id: conv.id,
    accountId: conv.accountId,
    question: question?.text ?? '',
    createdAt: conv.createdAt.toISOString(),
    ownedByMe: conv.createdBy === employeeId,
    state: deriveState({
      generating: generationLockHeld(conv),
      saved: !!reviewed,
      hasAnswer,
      outcome: latest?.outcome,
      reviewReasons: (latest?.reviewReasons as string[]) ?? [],
    }),
    topics: presented?.topics ?? [],
    signals,
  };
}

async function presentAnswer(answer: typeof answers.$inferSelect) {
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
    cites[String(card.n)] = card;
    if (card.status) sourceUpdated = true;
    if (card.cat) categories.push(card.cat);
  }
  const text = answer.editedText ?? answer.answerText;
  const citedFacts = /\[F\d+\]/.test(text);
  const clarifications = (answer.clarifications ?? []) as {
    kind: string;
    prompt?: string;
    question?: string;
    options?: { fact: string; label: string }[];
  }[];
  return {
    id: answer.id,
    turnId: answer.turnId,
    turnSeq: (await db().select({ seq: turns.seq }).from(turns).where(eq(turns.id, answer.turnId)))[0]?.seq,
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
    topics: topicsOf({ outcome: answer.outcome, citedCategories: categories, citedFacts }),
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

