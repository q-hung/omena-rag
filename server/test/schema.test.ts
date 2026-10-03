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
});
