import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { rowsOf } from '../src/db/rows.ts';
import { rfpAnswers, rfpQuestions, rfpReviews } from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { RFP_STATE_FROM, RFP_STATE_SQL, deriveQuestionState } from '../src/services/rfp-state.ts';
import { runWorker } from '../src/worker.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';
import { sql } from 'drizzle-orm';

const PASSWORD = 'test-password';
let app: Awaited<ReturnType<typeof buildTestApp>>;
let ada: Record<string, string>;
let rei: Record<string, string>;

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  await runWorker({ once: true });
  app = await buildTestApp();
  const login = async (email: string) => {
    const res = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
    );
    return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  };
  ada = await login('ada@omena.example');
  rei = await login('rei@omena.example');
});

afterAll(async () => {
  await app.close();
});

const call = (cookie: Record<string, string>, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  app.inject(asBrowser({ method, url, cookies: cookie, payload: payload as object }));

/** An RFP with one answered question (stub answer cites [1]). */
async function answered(text = 'Do you support SAML SSO?') {
  const created = await call(ada, 'POST', '/api/rfps', { title: text, questions: [{ text }] });
  const questionId = created.json().questions[0].id as number;
  await call(ada, 'POST', `/api/rfp-questions/${questionId}/regenerate`);
  const rfp = (await call(ada, 'GET', `/api/rfps/${created.json().id}`)).json();
  return { rfpId: rfp.id as number, questionId, answerId: rfp.questions[0].latestAnswer.id as number };
}
const getQuestion = async (rfpId: number) => (await call(ada, 'GET', `/api/rfps/${rfpId}`)).json().questions[0];
const review = (answerId: number, payload: unknown, cookie = ada) =>
  call(cookie, 'POST', `/api/rfp-answers/${answerId}/reviews`, payload);

describe('REV-01 edit', () => {
  it('rejects an unknown marker and leaves answer_text alone; stores a valid edit; creator only', async () => {
    const { answerId } = await answered();
    const [before] = await db().select().from(rfpAnswers).where(eq(rfpAnswers.id, answerId));
    const bad = await call(ada, 'PATCH', `/api/rfp-answers/${answerId}`, { editedText: 'Yes [1][7].' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('UNKNOWN_CITATION');

    expect((await call(rei, 'PATCH', `/api/rfp-answers/${answerId}`, { editedText: 'Hijack' })).statusCode).toBe(403);

    const ok = await call(ada, 'PATCH', `/api/rfp-answers/${answerId}`, { editedText: 'Yes, on Enterprise [1].' });
    expect(ok.statusCode).toBe(200);
    const [after] = await db().select().from(rfpAnswers).where(eq(rfpAnswers.id, answerId));
    expect(after!.answerText).toBe(before!.answerText);
    expect(after!.editedText).toBe('Yes, on Enterprise [1].');
  });
});

describe('REV-02 review', () => {
  it('accept stores final_text = edited text; empty text → 409; accept → needs work → accept keeps 3 rows', async () => {
    const { rfpId, answerId } = await answered();
    await call(ada, 'PATCH', `/api/rfp-answers/${answerId}`, { editedText: 'Edited answer [1].' });
    const accepted = await review(answerId, { verdict: 'accepted' });
    expect(accepted.statusCode).toBe(201);
    let q = accepted.json().questions[0];
    expect(q.reviewState).toBe('accepted');
    expect(q.latestAnswer.reviews[0]).toMatchObject({ verdict: 'accepted', finalText: 'Edited answer [1].', sourceStale: false });

    expect((await review(answerId, { verdict: 'needs_work', note: 'Tighten it' })).json().questions[0].reviewState).toBe('needs_work');
    expect((await review(answerId, { verdict: 'accepted' })).json().questions[0].reviewState).toBe('accepted');
    const listed = (await call(ada, 'GET', '/api/rfps')).json().rfps.find((r: { id: number }) => r.id === rfpId);
    expect(listed.progress).toEqual({ total: 1, generated: 1, accepted: 1, failed: 0 });
    q = await getQuestion(rfpId);
    expect(q.latestAnswer.reviews.map((r: { verdict: string }) => r.verdict)).toEqual(['accepted', 'needs_work', 'accepted']);
    expect(q.reviewHistory).toHaveLength(3);

    await call(ada, 'PATCH', `/api/rfp-answers/${answerId}`, { editedText: '   ' });
    const empty = await review(answerId, { verdict: 'accepted' });
    expect(empty.statusCode).toBe(409);
    expect(empty.json().error.code).toBe('EMPTY_TEXT');
  });

  it('wrong_evidence needs at least one known citation', async () => {
    const { answerId } = await answered();
    expect((await review(answerId, { verdict: 'wrong_evidence' })).statusCode).toBe(400);
    expect((await review(answerId, { verdict: 'wrong_evidence', flaggedCitations: [] })).statusCode).toBe(400);
    expect((await review(answerId, { verdict: 'wrong_evidence', flaggedCitations: [9] })).statusCode).toBe(400);
    const ok = await review(answerId, { verdict: 'wrong_evidence', flaggedCitations: [1], note: 'wrong doc' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().questions[0].reviewState).toBe('wrong_evidence');
  });

  it('403 for another employee; 409 NOT_LATEST after regenerate; old reviews stay in history; 409 while processing', async () => {
    const { rfpId, questionId, answerId } = await answered();
    expect((await review(answerId, { verdict: 'accepted' }, rei)).statusCode).toBe(403);
    await review(answerId, { verdict: 'accepted' });

    await call(ada, 'POST', `/api/rfp-questions/${questionId}/regenerate`);
    const old = await review(answerId, { verdict: 'needs_work' });
    expect(old.statusCode).toBe(409);
    expect(old.json().error.code).toBe('NOT_LATEST');
    const q = await getQuestion(rfpId);
    expect(q.reviewState).toBe('draft');
    expect(q.reviewHistory.map((r: { verdict: string }) => r.verdict)).toEqual(['accepted']);

    await db().update(rfpQuestions).set({ status: 'processing' }).where(eq(rfpQuestions.id, questionId));
    const busy = await review(q.latestAnswer.id, { verdict: 'accepted' });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('GENERATION_IN_PROGRESS');
  });
});

describe('REV-04 source changed', () => {
  it('archiving a cited document flags the answer and an accept stores source_stale', async () => {
    const { rfpId, answerId } = await answered();
    const q = await getQuestion(rfpId);
    expect(q.latestAnswer.sourceStale).toBe(false);
    const docId = q.latestAnswer.sources.find((s: { citationNumber: number | null }) => s.citationNumber != null).documentId;
    expect((await call(ada, 'POST', `/api/documents/${docId}/archive`)).statusCode).toBeLessThan(300);
    try {
      expect((await getQuestion(rfpId)).latestAnswer.sourceStale).toBe(true);
      const accepted = await review(answerId, { verdict: 'accepted' });
      expect(accepted.statusCode).toBe(201);
      const rows = await db().select().from(rfpReviews).where(eq(rfpReviews.answerId, answerId));
      expect(rows.map((r) => r.sourceStale)).toEqual([true]);
    } finally {
      await call(ada, 'POST', `/api/documents/${docId}/restore`);
    }
  });
});

describe('RFP-WF-01 SQL and TS state derivations agree', () => {
  it('on every status x answer x verdict combination', async () => {
    const created = await call(ada, 'POST', '/api/rfps', {
      title: 'States',
      questions: [{ text: 'seed question' }],
    });
    const rfpId = created.json().id as number;
    const adaId = Number(rowsOf(await db().execute(sql`select id from employees where email = 'ada@omena.example'`))[0]!.id);
    const verdicts = [undefined, 'accepted', 'needs_work', 'wrong_evidence'] as const;
    const expected = new Map<number, string>();
    let seq = 10;
    for (const status of ['pending', 'queued', 'processing', 'done', 'failed']) {
      for (const hasAnswer of [false, true]) {
        for (const verdict of verdicts) {
          if (!hasAnswer && verdict) {
            continue;
          }
          const [q] = await db()
            .insert(rfpQuestions)
            .values({ rfpId, seq: seq++, text: `${status}/${hasAnswer}/${verdict}`, status })
            .returning({ id: rfpQuestions.id });
          if (hasAnswer) {
            // an older accepted review must not leak into the latest answer's state
            const [old] = await db()
              .insert(rfpAnswers)
              .values({ questionId: q!.id, answerText: 'old', evidenceStatus: 'HIGH_EVIDENCE', modelEvidenceStatus: 'HIGH_EVIDENCE', model: 'm', promptVersion: 'p', retrievalMode: 'vector' })
              .returning({ id: rfpAnswers.id });
            await db().insert(rfpReviews).values({ answerId: old!.id, verdict: 'accepted', finalText: 'old', reviewerId: adaId });
            const [latest] = await db()
              .insert(rfpAnswers)
              .values({ questionId: q!.id, answerText: 'new', evidenceStatus: 'HIGH_EVIDENCE', modelEvidenceStatus: 'HIGH_EVIDENCE', model: 'm', promptVersion: 'p', retrievalMode: 'vector' })
              .returning({ id: rfpAnswers.id });
            if (verdict) {
              await db().insert(rfpReviews).values({
                answerId: latest!.id,
                verdict,
                finalText: verdict === 'accepted' ? 'x' : null,
                flaggedCitations: verdict === 'wrong_evidence' ? [1] : null,
                reviewerId: adaId,
              });
            }
          }
          expected.set(q!.id, deriveQuestionState({ status, hasAnswer, latestVerdict: verdict }));
        }
      }
    }
    const rows = rowsOf(
      await db().execute(sql`select q.id, ${RFP_STATE_SQL} as state from ${RFP_STATE_FROM} where q.rfp_id = ${rfpId}`),
    );
    for (const [id, state] of expected) {
      expect(rows.find((r) => Number(r.id) === id)?.state).toBe(state);
    }
    expect(expected.size).toBeGreaterThanOrEqual(25);
  });
});
