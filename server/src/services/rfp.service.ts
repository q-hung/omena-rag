import { extname } from 'node:path';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { extract } from '../ingest/extract.ts';
import { QUESTION_STATUSES, employees, rfpAnswerSources, rfpAnswers, rfpQuestions, rfpReviews, rfps } from '../db/schema.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { MD_CHAR_LIMIT, inspectFile } from './document-upload.service.ts';
import { requireOwner } from './generate.service.ts';
import { extractQuestions } from './rfp-extract.ts';
import { deriveQuestionState } from './rfp-state.ts';

export type NewRfpQuestion = { text: string; section?: string };

export async function createRfp(input: {
  title: string;
  questions: NewRfpQuestion[];
  employeeId: number;
}) {
  const id = await db().transaction(async (tx) => {
    const [rfp] = await tx
      .insert(rfps)
      .values({
        title: input.title,
        sourceKind: 'paste',
        status: 'confirmed',
        createdBy: input.employeeId,
      })
      .returning({ id: rfps.id });
    await tx.insert(rfpQuestions).values(
      input.questions.map((q, i) => ({
        rfpId: rfp!.id,
        seq: i + 1,
        text: q.text,
        section: q.section || null,
        status: 'pending',
      })),
    );
    return rfp!.id;
  });
  return getRfp(id, input.employeeId);
}

const SHORT_ERROR = 200;

/** Paste or file intake (EXT-01/02). Lands in `draft`; a failed file extraction lands in `extraction_failed`. */
export async function createRfpFromSource(input: {
  title: string;
  text?: string;
  file?: { filename: string; bytes: Buffer };
  employeeId: number;
}) {
  let sourceText: string | null = null;
  let extractionError: string | null = null;
  if (input.file) {
    const { mimeType } = inspectFile(input.file.filename, input.file.bytes);
    try {
      if (mimeType === 'application/pdf') {
        const r = await extract(input.file.bytes, input.file.filename);
        sourceText = r.pages.map((p) => p.text).join('\n');
      } else {
        sourceText = new TextDecoder().decode(input.file.bytes);
      }
      if (sourceText.length > MD_CHAR_LIMIT) {
        sourceText = null;
        extractionError = `The extracted text exceeds ${MD_CHAR_LIMIT.toLocaleString()} characters.`;
      }
    } catch (e) {
      extractionError = (e instanceof Error ? e.message : 'Extraction failed.').slice(0, SHORT_ERROR);
    }
  } else {
    sourceText = input.text ?? '';
  }
  const questions = sourceText == null ? [] : extractQuestions(sourceText);
  const id = await db().transaction(async (tx) => {
    const [rfp] = await tx
      .insert(rfps)
      .values({
        title: input.title,
        sourceKind: input.file ? 'file' : 'paste',
        sourceFilename: input.file?.filename ?? null,
        sourceText,
        status: sourceText == null ? 'extraction_failed' : 'draft',
        extractionError,
        createdBy: input.employeeId,
      })
      .returning({ id: rfps.id });
    await insertQuestions(tx, rfp!.id, questions);
    return rfp!.id;
  });
  return getRfp(id, input.employeeId);
}

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

async function insertQuestions(tx: Tx, rfpId: number, questions: { text: string; section?: string | null }[]) {
  if (questions.length) {
    await tx.insert(rfpQuestions).values(
      questions.map((q, i) => ({ rfpId, seq: i + 1, text: q.text, section: q.section || null, status: 'pending' })),
    );
  }
}

/** Locks the RFP row, checks ownership and that it is still editable, then runs `fn`. */
async function editDraft<T>(
  id: number,
  employeeId: number,
  statuses: string[],
  fn: (tx: Tx, rfp: typeof rfps.$inferSelect) => Promise<T>,
): Promise<void> {
  await db().transaction(async (tx) => {
    const [rfp] = await tx.select().from(rfps).where(eq(rfps.id, id)).for('update');
    if (!rfp) {
      throw notFound('RFP_NOT_FOUND', 'No such RFP.');
    }
    requireOwner({ createdBy: rfp.createdBy }, employeeId);
    if (!statuses.includes(rfp.status)) {
      throw conflict('RFP_NOT_DRAFT', 'Questions can only be changed before the RFP is confirmed.');
    }
    await fn(tx, rfp);
  });
}

export async function replaceQuestions(id: number, employeeId: number, questions: NewRfpQuestion[]) {
  await editDraft(id, employeeId, ['draft'], async (tx) => {
    await tx.delete(rfpQuestions).where(eq(rfpQuestions.rfpId, id));
    await insertQuestions(tx, id, questions);
  });
  return getRfp(id, employeeId);
}

/** Re-run extraction from `source_text`, or from `text` when given (paste after a failed file). */
export async function reextract(id: number, employeeId: number, text?: string) {
  await editDraft(id, employeeId, ['draft', 'extraction_failed'], async (tx, rfp) => {
    const source = text ?? rfp.sourceText;
    if (source == null) {
      throw badRequest('NO_SOURCE_TEXT', 'This RFP has no text to extract from. Paste the text instead.');
    }
    const questions = extractQuestions(source);
    await tx.delete(rfpQuestions).where(eq(rfpQuestions.rfpId, id));
    await insertQuestions(tx, id, questions);
    await tx
      .update(rfps)
      .set({ status: 'draft', extractionError: null, sourceText: source, ...(text != null && { sourceKind: 'paste' }) })
      .where(eq(rfps.id, id));
  });
  return getRfp(id, employeeId);
}

export async function confirmRfp(id: number, employeeId: number) {
  await editDraft(id, employeeId, ['draft'], async (tx) => {
    const found = await tx.select({ id: rfpQuestions.id }).from(rfpQuestions).where(eq(rfpQuestions.rfpId, id)).limit(1);
    if (!found.length) {
      throw conflict('NO_QUESTIONS', 'Add at least one question before confirming.');
    }
    await tx.update(rfps).set({ status: 'confirmed' }).where(eq(rfps.id, id));
  });
  return getRfp(id, employeeId);
}

export async function listRfps(input: { employeeId: number; mine: '0' | '1' }) {
  const rows = await db()
    .select()
    .from(rfps)
    .where(input.mine === '1' ? eq(rfps.createdBy, input.employeeId) : undefined)
    .orderBy(desc(rfps.createdAt), desc(rfps.id));
  return {
    rfps: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      ownedByMe: r.createdBy === input.employeeId,
    })),
  };
}

export async function getRfp(id: number, employeeId: number) {
  const [rfp] = await db().select().from(rfps).where(eq(rfps.id, id));
  if (!rfp) {
    throw notFound('RFP_NOT_FOUND', 'No such RFP.');
  }
  const [creator] = await db()
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.id, rfp.createdBy));
  const questions = await db()
    .select()
    .from(rfpQuestions)
    .where(eq(rfpQuestions.rfpId, id))
    .orderBy(rfpQuestions.seq);
  const questionIds = questions.map((q) => q.id);
  const latestAnswers = questionIds.length
    ? await db()
        .selectDistinctOn([rfpAnswers.questionId])
        .from(rfpAnswers)
        .where(inArray(rfpAnswers.questionId, questionIds))
        .orderBy(rfpAnswers.questionId, desc(rfpAnswers.id))
    : [];
  const latestByQuestion = new Map(latestAnswers.map((a) => [a.questionId, a]));
  const answerIds = latestAnswers.map((a) => a.id);
  const sourceRows = answerIds.length
    ? await db()
        .select()
        .from(rfpAnswerSources)
        .where(inArray(rfpAnswerSources.answerId, answerIds))
        .orderBy(rfpAnswerSources.answerId, rfpAnswerSources.rank)
    : [];
  const reviewRows = answerIds.length
    ? await db()
        .select()
        .from(rfpReviews)
        .where(inArray(rfpReviews.answerId, answerIds))
        .orderBy(rfpReviews.answerId, rfpReviews.id)
    : [];
  const sourcesBy = groupBy(sourceRows, (s) => s.answerId);
  const reviewsBy = groupBy(reviewRows, (r) => r.answerId);

  return {
    id: rfp.id,
    title: rfp.title,
    status: rfp.status,
    sourceKind: rfp.sourceKind,
    extractionError: rfp.extractionError,
    createdAt: rfp.createdAt.toISOString(),
    createdBy: creator,
    ownedByMe: rfp.createdBy === employeeId,
    progress: {
      total: questions.length,
      ...Object.fromEntries(QUESTION_STATUSES.map((st) => [st, questions.filter((q) => q.status === st).length])),
    },
    questions: questions.map((q) => {
      const answer = latestByQuestion.get(q.id);
      const reviews = answer ? (reviewsBy.get(answer.id) ?? []) : [];
      const latestReview = reviews.at(-1);
      return {
        id: q.id,
        seq: q.seq,
        text: q.text,
        section: q.section,
        status: q.status,
        errorCode: q.errorCode,
        reviewState: deriveQuestionState({
          status: q.status,
          hasAnswer: !!answer,
          latestVerdict: latestReview?.verdict,
        }),
        latestAnswer: answer
          ? {
              id: answer.id,
              answerText: answer.answerText,
              editedText: answer.editedText,
              evidenceStatus: answer.evidenceStatus,
              modelEvidenceStatus: answer.modelEvidenceStatus,
              gaps: answer.gaps,
              reviewReasons: answer.reviewReasons,
              model: answer.model,
              promptVersion: answer.promptVersion,
              retrievalMode: answer.retrievalMode,
              createdAt: answer.createdAt.toISOString(),
              sources: (sourcesBy.get(answer.id) ?? []).map((s) => ({
                rank: s.rank,
                chunkId: s.chunkId,
                score: s.score,
                citationNumber: s.citationNumber,
                documentId: s.documentId,
                versionId: s.versionId,
                title: s.title,
                heading: s.heading,
                pageNumber: s.pageNumber,
              })),
              reviews: reviews.map((r) => ({
                id: r.id,
                verdict: r.verdict,
                finalText: r.finalText,
                flaggedCitations: r.flaggedCitations,
                note: r.note,
                sourceStale: r.sourceStale,
                reviewerId: r.reviewerId,
                createdAt: r.createdAt.toISOString(),
              })),
            }
          : null,
      };
    }),
  };
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);
    if (list) {
      list.push(row);
    } else {
      map.set(id, [row]);
    }
  }
  return map;
}
