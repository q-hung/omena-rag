import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import {
  accounts,
  answers,
  conversations,
  documentChunks,
  documentFiles,
  documentVersions,
  documents,
  employees,
  reviewedAnswers,
  rfpAnswerSources,
  rfpAnswers,
  rfpQuestions,
  rfpReviews,
  rfps,
  turns,
} from '../src/db/schema.ts';

let n = 0;

// Drizzle wraps the driver error; the constraint name lives on the cause.
async function violatedConstraint(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint ?? String(error);
  }
  throw new Error('expected a constraint violation');
}

async function anEmployee() {
  const [row] = await db()
    .insert(employees)
    .values({ email: `schema${++n}@omena.example`, name: 'Schema Tester', passwordHash: 'x' })
    .returning();
  return row!;
}

async function anAccount(ref = `A-90${++n}`) {
  const [row] = await db()
    .insert(accounts)
    .values({
      ref,
      companyName: 'Test Co',
      plan: 'pro',
      status: 'active',
      billingInterval: 'monthly',
      region: 'FI',
      customerSince: '2026-01-01',
    })
    .returning();
  return row!;
}

async function aDocumentWithChunk(employeeId: number) {
  const [doc] = await db()
    .insert(documents)
    .values({ title: 'Plan comparison', category: 'Plans', createdBy: employeeId })
    .returning();
  const [version] = await db()
    .insert(documentVersions)
    .values({
      documentId: doc!.id,
      versionNumber: 1,
      originalFilename: 'plans.md',
      mimeType: 'text/markdown',
      sizeBytes: 12,
      contentHash: 'abc',
      effectiveAt: '2026-01-01',
      indexingStatus: 'ready',
    })
    .returning();
  await db()
    .insert(documentFiles)
    .values({ versionId: version!.id, bytes: Buffer.from('# Plans') });
  await db()
    .insert(documentChunks)
    .values({
      versionId: version!.id,
      chunkIndex: 0,
      heading: 'Basic',
      text: 'Basic has no SSO.',
      embedding: Array.from({ length: 768 }, () => 0.01),
      embeddingModel: 'stub',
    });
  await db().update(documents).set({ activeVersionId: version!.id }).where(eq(documents.id, doc!.id));
  return doc!;
}

describe('schema', () => {
  it('rejects a category outside the KB-02 list', async () => {
    const employee = await anEmployee();
    const constraint = await violatedConstraint(() =>
      db().insert(documents).values({ title: 'Nope', category: 'Marketing', createdBy: employee.id }),
    );
    expect(constraint).toBe('documents_category');
  });

  it('rejects a second reviewed answer for one conversation (ANS-04)', async () => {
    const employee = await anEmployee();
    const account = await anAccount();
    const [conversation] = await db()
      .insert(conversations)
      .values({ accountId: account.id, createdBy: employee.id })
      .returning();
    const [turn] = await db()
      .insert(turns)
      .values({
        conversationId: conversation!.id,
        seq: 1,
        kind: 'question',
        text: 'Why?',
        createdBy: employee.id,
      })
      .returning();

    const answerIds: number[] = [];
    for (const text of ['First.', 'Second.']) {
      const [answer] = await db()
        .insert(answers)
        .values({
          conversationId: conversation!.id,
          turnId: turn!.id,
          createdBy: employee.id,
          outcome: 'answer',
          answerText: text,
          factsSnapshot: { facts: [], empty: [] },
          asOf: '2026-10-02',
          model: 'stub',
          promptVersion: 'v1',
        })
        .returning();
      answerIds.push(answer!.id);
    }

    const review = (answerId: number) => ({
      conversationId: conversation!.id,
      answerId,
      finalText: 'Reviewed.',
      sources: [],
      facts: [],
      reviewAcknowledged: false,
      reviewerId: employee.id,
    });
    await db().insert(reviewedAnswers).values(review(answerIds[0]!));
    const constraint = await violatedConstraint(() =>
      db().insert(reviewedAnswers).values(review(answerIds[1]!)),
    );
    expect(constraint).toBe('reviewed_answers_conversation_id_unique');
  });

  it('cascades a document delete to versions, files and chunks (KB-08)', async () => {
    const employee = await anEmployee();
    const doc = await aDocumentWithChunk(employee.id);

    await db().delete(documents).where(eq(documents.id, doc.id));

    expect(await db().select().from(documentVersions)).toHaveLength(0);
    expect(await db().select().from(documentFiles)).toHaveLength(0);
    expect(await db().select().from(documentChunks)).toHaveLength(0);
  });

  it('requires a question to carry text and a reply to carry text or selections', async () => {
    const employee = await anEmployee();
    const account = await anAccount();
    const [conversation] = await db()
      .insert(conversations)
      .values({ accountId: account.id, createdBy: employee.id })
      .returning();

    expect(
      await violatedConstraint(() =>
        db()
          .insert(turns)
          .values({ conversationId: conversation!.id, seq: 1, kind: 'question', createdBy: employee.id }),
      ),
    ).toBe('turns_content');

    expect(
      await violatedConstraint(() =>
        db().insert(turns).values({
          conversationId: conversation!.id,
          seq: 1,
          kind: 'clarification_reply',
          selectedFacts: [],
          createdBy: employee.id,
        }),
      ),
    ).toBe('turns_content');

    const [reply] = await db()
      .insert(turns)
      .values({
        conversationId: conversation!.id,
        seq: 1,
        kind: 'clarification_reply',
        selectedFacts: ['F10'],
        createdBy: employee.id,
      })
      .returning();
    expect(reply!.selectedFacts).toEqual(['F10']);
  });

  it('accepts a Compliance document', async () => {
    const employee = await anEmployee();
    const [doc] = await db()
      .insert(documents)
      .values({ title: 'SOC silence', category: 'Compliance', createdBy: employee.id })
      .returning();
    expect(doc?.category).toBe('Compliance');
  });

  it('rejects a duplicate RFP question seq and invalid evidence, verdict and status', async () => {
    const employee = await anEmployee();
    const [rfp] = await db()
      .insert(rfps)
      .values({
        title: 'Q',
        sourceKind: 'paste',
        sourceText: 'Do you support SSO?',
        status: 'draft',
        createdBy: employee.id,
      })
      .returning();

    expect(
      await violatedConstraint(() =>
        db().insert(rfps).values({
          title: 'Bad',
          sourceKind: 'paste',
          status: 'open',
          createdBy: employee.id,
        }),
      ),
    ).toBe('rfps_status');

    const question = {
      rfpId: rfp!.id,
      seq: 1,
      text: 'Do you support SAML SSO?',
      status: 'pending' as const,
    };
    await db().insert(rfpQuestions).values(question);
    expect(await violatedConstraint(() => db().insert(rfpQuestions).values(question))).toBe(
      'rfp_questions_rfp_seq_key',
    );
    expect(
      await violatedConstraint(() =>
        db().insert(rfpQuestions).values({ ...question, seq: 2, status: 'waiting' }),
      ),
    ).toBe('rfp_questions_status');

    const [q] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.rfpId, rfp!.id));
    expect(
      await violatedConstraint(() =>
        db().insert(rfpAnswers).values({
          questionId: q!.id,
          answerText: 'No.',
          evidenceStatus: 'CONFIDENT',
          modelEvidenceStatus: 'HIGH_EVIDENCE',
          model: 'stub',
          promptVersion: 'v1',
          retrievalMode: 'vector',
        }),
      ),
    ).toBe('rfp_answers_evidence_status');

    const [answer] = await db()
      .insert(rfpAnswers)
      .values({
        questionId: q!.id,
        answerText: 'No.',
        evidenceStatus: 'HIGH_EVIDENCE',
        modelEvidenceStatus: 'HIGH_EVIDENCE',
        model: 'stub',
        promptVersion: 'v1',
        retrievalMode: 'vector',
      })
      .returning();
    expect(
      await violatedConstraint(() =>
        db().insert(rfpReviews).values({
          answerId: answer!.id,
          verdict: 'approved',
          reviewerId: employee.id,
        }),
      ),
    ).toBe('rfp_reviews_verdict');
  });

  it('cascades an RFP delete to questions, answers, sources and reviews', async () => {
    const employee = await anEmployee();
    const doc = await aDocumentWithChunk(employee.id);
    const [version] = await db()
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc.id));
    const [chunk] = await db()
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.versionId, version!.id));

    const [rfp] = await db()
      .insert(rfps)
      .values({
        title: 'Cascade',
        sourceKind: 'paste',
        sourceText: 'q',
        status: 'confirmed',
        createdBy: employee.id,
      })
      .returning();
    const [question] = await db()
      .insert(rfpQuestions)
      .values({ rfpId: rfp!.id, seq: 1, text: 'SSO?' })
      .returning();
    const [answer] = await db()
      .insert(rfpAnswers)
      .values({
        questionId: question!.id,
        answerText: 'Yes [1].',
        evidenceStatus: 'HIGH_EVIDENCE',
        modelEvidenceStatus: 'HIGH_EVIDENCE',
        model: 'stub',
        promptVersion: 'v1',
        retrievalMode: 'vector',
      })
      .returning();
    await db().insert(rfpAnswerSources).values({
      answerId: answer!.id,
      rank: 1,
      chunkId: chunk!.id,
      citationNumber: 1,
      documentId: doc.id,
      versionId: version!.id,
      title: doc.title,
      heading: chunk!.heading,
    });
    await db().insert(rfpReviews).values({
      answerId: answer!.id,
      verdict: 'accepted',
      finalText: 'Yes.',
      reviewerId: employee.id,
    });

    await db().delete(rfps).where(eq(rfps.id, rfp!.id));

    expect(await db().select().from(rfpQuestions).where(eq(rfpQuestions.rfpId, rfp!.id))).toHaveLength(0);
    expect(await db().select().from(rfpAnswers).where(eq(rfpAnswers.questionId, question!.id))).toHaveLength(0);
    expect(await db().select().from(rfpAnswerSources).where(eq(rfpAnswerSources.answerId, answer!.id))).toHaveLength(
      0,
    );
    expect(await db().select().from(rfpReviews).where(eq(rfpReviews.answerId, answer!.id))).toHaveLength(0);
  });

  it('nulls rfp_answer_sources.chunk_id on document delete and keeps the snapshot ids', async () => {
    const employee = await anEmployee();
    const doc = await aDocumentWithChunk(employee.id);
    const [version] = await db()
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc.id));
    const [chunk] = await db()
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.versionId, version!.id));

    const [rfp] = await db()
      .insert(rfps)
      .values({
        title: 'Keep snapshot',
        sourceKind: 'paste',
        sourceText: 'q',
        status: 'confirmed',
        createdBy: employee.id,
      })
      .returning();
    const [question] = await db()
      .insert(rfpQuestions)
      .values({ rfpId: rfp!.id, seq: 1, text: 'SSO?' })
      .returning();
    const [answer] = await db()
      .insert(rfpAnswers)
      .values({
        questionId: question!.id,
        answerText: 'Yes [1].',
        evidenceStatus: 'HIGH_EVIDENCE',
        modelEvidenceStatus: 'HIGH_EVIDENCE',
        model: 'stub',
        promptVersion: 'v1',
        retrievalMode: 'vector',
      })
      .returning();
    await db().insert(rfpAnswerSources).values({
      answerId: answer!.id,
      rank: 1,
      chunkId: chunk!.id,
      citationNumber: 1,
      documentId: doc.id,
      versionId: version!.id,
      title: doc.title,
    });

    await db().delete(documents).where(eq(documents.id, doc.id));

    const [source] = await db().select().from(rfpAnswerSources).where(eq(rfpAnswerSources.answerId, answer!.id));
    expect(source?.chunkId).toBeNull();
    expect(source?.documentId).toBe(doc.id);
    expect(source?.versionId).toBe(version!.id);
  });
});
