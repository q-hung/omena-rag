import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import { rfpReviews, type REVIEW_VERDICTS } from '../db/schema.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { requireOwner } from './generate.service.ts';

const MARKER = /\[(\d+)\]/g;
type Executor = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

/** REV-04: ids of answers citing a version that is no longer active, or an archived/deleted document (REQ_V2 §7.6). */
export async function staleAnswerIds(tx: Executor, answerIds: number[]): Promise<Set<number>> {
  if (!answerIds.length) {
    return new Set();
  }
  const rows = rowsOf(
    await tx.execute(sql`
      select distinct s.answer_id
      from rfp_answer_sources s
      left join document_chunks c on c.id = s.chunk_id
      left join document_versions v on v.id = c.version_id
      left join documents d on d.id = v.document_id
      where s.answer_id in (${sql.join(answerIds.map((id) => sql`${id}`), sql`, `)})
        and s.citation_number is not null
        and (c.id is null or d.archived_at is not null or d.active_version_id is distinct from v.id)
    `),
  );
  return new Set(rows.map((r) => Number(r.answer_id)));
}

/** Locks the question row (serialises with regenerate's save), then checks creator before any 409. */
async function lockLatestAnswer(tx: Executor, answerId: number, employeeId: number) {
  const [row] = rowsOf(
    await tx.execute(sql`
      select a.id, a.answer_text, a.edited_text, a.question_id, q.status, r.created_by, r.id as rfp_id,
        (select max(id) from rfp_answers where question_id = a.question_id) as latest_id,
        coalesce((
          select array_agg(citation_number order by citation_number)
          from rfp_answer_sources where answer_id = a.id and citation_number is not null
        ), '{}') as citations
      from rfp_answers a
      join rfp_questions q on q.id = a.question_id
      join rfps r on r.id = q.rfp_id
      where a.id = ${answerId}
      for update of q
    `),
  );
  if (!row) {
    throw notFound('ANSWER_NOT_FOUND', 'No such answer.');
  }
  requireOwner({ createdBy: Number(row.created_by) }, employeeId);
  if (row.status === 'queued' || row.status === 'processing') {
    throw conflict('GENERATION_IN_PROGRESS', 'Wait for generation to finish.');
  }
  if (Number(row.latest_id) !== answerId) {
    throw conflict('NOT_LATEST', 'Only the latest answer can be changed.');
  }
  return {
    rfpId: Number(row.rfp_id),
    answerText: String(row.answer_text),
    editedText: row.edited_text == null ? null : String(row.edited_text),
    citations: (row.citations as (number | string)[]).map(Number),
  };
}

/** REV-01. Markers can be removed, not added: each [n] must be a citation of this answer. */
export async function editRfpAnswer(input: { answerId: number; employeeId: number; editedText: string }): Promise<number> {
  return db().transaction(async (tx) => {
    const a = await lockLatestAnswer(tx, input.answerId, input.employeeId);
    for (const [marker, n] of input.editedText.matchAll(MARKER)) {
      if (!a.citations.includes(Number(n))) {
        throw badRequest('UNKNOWN_CITATION', `${marker} doesn't match a citation in this answer.`);
      }
    }
    await tx.execute(sql`
      update rfp_answers
      set edited_text = ${input.editedText}, edited_by = ${input.employeeId}, edited_at = now()
      where id = ${input.answerId}
    `);
    return a.rfpId;
  });
}

/** REV-02. Appends a row; earlier reviews stay. */
export async function reviewRfpAnswer(input: {
  answerId: number;
  employeeId: number;
  verdict: (typeof REVIEW_VERDICTS)[number];
  note?: string;
  flaggedCitations?: number[];
}): Promise<number> {
  return db().transaction(async (tx) => {
    const a = await lockLatestAnswer(tx, input.answerId, input.employeeId);
    let finalText: string | null = null;
    let flagged: number[] | null = null;
    if (input.verdict === 'accepted') {
      finalText = (a.editedText ?? a.answerText).trim();
      if (!finalText) {
        throw conflict('EMPTY_TEXT', 'The answer is empty.');
      }
    } else if (input.verdict === 'wrong_evidence') {
      flagged = [...new Set(input.flaggedCitations ?? [])];
      if (!flagged.length || flagged.some((n) => !a.citations.includes(n))) {
        throw badRequest('INVALID_FLAGGED_CITATIONS', 'Flag at least one citation of this answer.');
      }
    }
    const stale = (await staleAnswerIds(tx, [input.answerId])).has(input.answerId);
    await tx.insert(rfpReviews).values({
      answerId: input.answerId,
      verdict: input.verdict,
      finalText,
      flaggedCitations: flagged,
      note: input.note?.trim() || null,
      sourceStale: stale,
      reviewerId: input.employeeId,
    });
    return a.rfpId;
  });
}
