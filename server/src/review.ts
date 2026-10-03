import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import { answers, reviewedAnswers } from './db/schema.ts';
import { badRequest, conflict, notFound } from './errors.ts';
import { generationLockHeld, requireOwner } from './generate.ts';
import { rowsOf } from './upload.ts';

const MARKER = /\[(F)?(\d+)\]/g;

export async function editAnswer(input: { answerId: number; employeeId: number; editedText: string }): Promise<number> {
  return db().transaction(async (tx) => {
    const [answer] = await tx.select().from(answers).where(eq(answers.id, input.answerId));
    if (!answer) throw notFound('ANSWER_NOT_FOUND', 'No such answer.');
    const [conv] = rowsOf(
      await tx.execute(sql`select * from conversations where id = ${answer.conversationId} for update`),
    );
    if (!conv) throw notFound('CONVERSATION_NOT_FOUND', 'No such conversation.');
    requireOwner({ createdBy: Number(conv.created_by) }, input.employeeId);
    const [reviewed] = await tx
      .select({ id: reviewedAnswers.id })
      .from(reviewedAnswers)
      .where(eq(reviewedAnswers.conversationId, answer.conversationId));
    if (reviewed) throw conflict('ALREADY_SAVED', 'This conversation is already saved.');
    const [latest] = await tx
      .select({ id: answers.id })
      .from(answers)
      .where(eq(answers.conversationId, answer.conversationId))
      .orderBy(desc(answers.id))
      .limit(1);
    if (latest?.id !== input.answerId) throw conflict('NOT_LATEST', 'Only the latest answer can be edited.');

    // ANS-02: markers can be removed but not added, so only the model text's own markers are allowed.
    // The normaliser already checked those against answer_sources and the fact snapshot.
    const allowed = new Set([...answer.answerText.matchAll(MARKER)].map((m) => m[0]));
    for (const [marker] of input.editedText.matchAll(MARKER)) {
      if (!allowed.has(marker)) throw badRequest('UNKNOWN_CITATION', `${marker} doesn't match a citation in this answer.`);
    }

    await tx
      .update(answers)
      .set({ editedText: input.editedText, editedBy: input.employeeId, editedAt: new Date() })
      .where(eq(answers.id, input.answerId));
    return answer.conversationId;
  });
}

export async function reviewConversation(input: {
  conversationId: number;
  employeeId: number;
  answerId: number;
  reviewAcknowledged?: boolean;
}): Promise<number> {
  return db().transaction(async (tx) => {
    const [conv] = rowsOf(
      await tx.execute(sql`select * from conversations where id = ${input.conversationId} for update`),
    );
    if (!conv) throw notFound('CONVERSATION_NOT_FOUND', 'No such conversation.');
    requireOwner({ createdBy: Number(conv.created_by) }, input.employeeId);

    if (
      generationLockHeld({
        generationToken: conv.generation_token ? String(conv.generation_token) : null,
        generationStartedAt: conv.generation_started_at ? new Date(String(conv.generation_started_at)) : null,
      })
    ) {
      throw conflict('GENERATION_IN_PROGRESS', 'Wait for generation to finish.');
    }

    const [existing] = await tx
      .select({ id: reviewedAnswers.id })
      .from(reviewedAnswers)
      .where(eq(reviewedAnswers.conversationId, input.conversationId));
    if (existing) throw conflict('ALREADY_SAVED', 'This conversation is already saved.');

    const [answer] = await tx.select().from(answers).where(eq(answers.id, input.answerId));
    if (!answer || answer.conversationId !== input.conversationId) {
      throw notFound('ANSWER_NOT_FOUND', 'No such answer.');
    }
    const [latest] = await tx
      .select({ id: answers.id })
      .from(answers)
      .where(eq(answers.conversationId, input.conversationId))
      .orderBy(desc(answers.id))
      .limit(1);
    if (latest?.id !== input.answerId) throw conflict('NOT_LATEST', 'This is not the conversation\'s latest answer.');
    if (answer.outcome === 'clarification_required') {
      throw conflict('CLARIFICATION_REQUIRED', 'Clarification requests can\'t be saved. Reply first.');
    }
    if (answer.outcome === 'out_of_scope') {
      throw conflict('OUT_OF_SCOPE', 'Out-of-scope answers can\'t be saved.');
    }

    const finalText = (answer.editedText ?? answer.answerText).trim();
    if (!finalText) throw conflict('EMPTY_TEXT', 'The answer is empty.');

    const docRows = rowsOf(
      await tx.execute(sql`
        select distinct d.id
        from answer_sources s
        join document_chunks c on c.id = s.chunk_id
        join document_versions v on v.id = c.version_id
        join documents d on d.id = v.document_id
        where s.answer_id = ${input.answerId} and s.citation_number is not null
        order by d.id
      `),
    );
    const docIds = docRows.map((r) => Number(r.id));
    if (docIds.length) {
      await tx.execute(
        sql`select id from documents where id in (${sql.join(
          docIds.map((id) => sql`${id}`),
          sql`, `,
        )}) order by id for share`,
      );
    }

    const [stale] = rowsOf(
      await tx.execute(sql`
        select exists (
          select 1
          from answer_sources s
          left join document_chunks c on c.id = s.chunk_id
          left join document_versions v on v.id = c.version_id
          left join documents d on d.id = v.document_id
          where s.answer_id = ${input.answerId}
            and s.citation_number is not null
            and (c.id is null or d.archived_at is not null or d.active_version_id is distinct from v.id)
        ) as n
      `),
    );
    if (stale?.n) throw conflict('SOURCE_STALE', 'A cited source changed. Regenerate first.');

    const reasons = (answer.reviewReasons as string[]) ?? [];
    if (reasons.length && !input.reviewAcknowledged) {
      throw conflict('REVIEW_REQUIRED', 'Check the flagged items and tick the box first.');
    }

    const used = new Set(
      [...finalText.matchAll(MARKER)].map((match) => (match[1] ? `F${match[2]}` : match[2]!)),
    );
    const sourceRows = rowsOf(
      await tx.execute(sql`
        select
          s.citation_number,
          d.id as document_id, d.title, d.category,
          v.id as version_id, v.version_number,
          c.heading, c.page_number
        from answer_sources s
        left join document_chunks c on c.id = s.chunk_id
        left join document_versions v on v.id = c.version_id
        left join documents d on d.id = v.document_id
        where s.answer_id = ${input.answerId} and s.citation_number is not null
        order by s.citation_number
      `),
    );
    const sources = sourceRows
      .filter((row) => used.has(String(row.citation_number)))
      .map((row) => ({
        number: Number(row.citation_number),
        document_id: row.document_id == null ? null : Number(row.document_id),
        version_id: row.version_id == null ? null : Number(row.version_id),
        title: row.title == null ? null : String(row.title),
        version: row.version_number == null ? null : Number(row.version_number),
        heading: row.heading == null ? null : String(row.heading),
        page: row.page_number == null ? null : Number(row.page_number),
        category: row.category == null ? null : String(row.category),
      }));

    const snapshot = answer.factsSnapshot as { facts?: { id: string; record?: unknown }[] };
    const facts = (snapshot.facts ?? [])
      .filter((f) => used.has(f.id))
      .map(({ record: _r, ...fact }) => fact);

    await tx.insert(reviewedAnswers).values({
      conversationId: input.conversationId,
      answerId: input.answerId,
      finalText,
      sources,
      facts,
      reviewAcknowledged: !!input.reviewAcknowledged,
      reviewerId: input.employeeId,
    });
    return input.conversationId;
  });
}

export async function reviewedSourceChanged(reviewedId: number): Promise<boolean> {
  const [row] = rowsOf(
    await db().execute(sql`
      select exists (
        select 1
        from jsonb_to_recordset((select sources from reviewed_answers where id = ${reviewedId}))
             as s(document_id bigint, version_id bigint)
        left join documents d on d.id = s.document_id
        where d.id is null or d.archived_at is not null or d.active_version_id is distinct from s.version_id
      ) as n
    `),
  );
  return !!row?.n;
}

export async function reviewedSourceChangedByConversation(ids: number[]): Promise<Set<number>> {
  const stale = new Set<number>();
  if (!ids.length) return stale;
  const rows = rowsOf(
    await db().execute(sql`
      select r.conversation_id
      from reviewed_answers r
      where r.conversation_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        and exists (
          select 1
          from jsonb_to_recordset(r.sources) as s(document_id bigint, version_id bigint)
          left join documents d on d.id = s.document_id
          where d.id is null or d.archived_at is not null or d.active_version_id is distinct from s.version_id
        )
    `),
  );
  for (const row of rows) stale.add(Number(row.conversation_id));
  return stale;
}

export async function unsavedSourceUpdated(answerIds: number[]): Promise<Set<number>> {
  const stale = new Set<number>();
  if (!answerIds.length) return stale;
  const rows = rowsOf(
    await db().execute(sql`
      select distinct s.answer_id
      from answer_sources s
      left join document_chunks c on c.id = s.chunk_id
      left join document_versions v on v.id = c.version_id
      left join documents d on d.id = v.document_id
      where s.answer_id in (${sql.join(answerIds.map((id) => sql`${id}`), sql`, `)})
        and s.citation_number is not null
        and (c.id is null or d.archived_at is not null or d.active_version_id is distinct from v.id)
    `),
  );
  for (const row of rows) stale.add(Number(row.answer_id));
  return stale;
}
