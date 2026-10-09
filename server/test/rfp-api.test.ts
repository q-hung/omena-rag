import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import { employees, rfpAnswerSources, rfpAnswers, rfpQuestions, rfpReviews } from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';
import { deriveQuestionState } from '../src/services/rfp-state.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';

let app: Awaited<ReturnType<typeof buildTestApp>>;
let ada: { cookie: Record<string, string>; id: number };
let rei: { cookie: Record<string, string> };

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  const [adaRow] = await db().select().from(employees).where(eq(employees.email, 'ada@omena.example'));
  app = await buildTestApp();
  const login = async (email: string) => {
    const res = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
    );
    return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  };
  ada = { cookie: await login('ada@omena.example'), id: adaRow!.id };
  rei = { cookie: await login('rei@omena.example') };
});

afterAll(async () => {
  await app.close();
});

const create = (
  cookie: Record<string, string>,
  payload: { title: string; questions: { text: string; section?: string }[] },
  headers?: Record<string, string>,
) => app.inject(asBrowser({ method: 'POST', url: '/api/rfps', cookies: cookie, payload, headers }));

describe('deriveQuestionState', () => {
  it('covers every REQ_V3 §4.4 row', () => {
    expect(deriveQuestionState({ status: 'queued', hasAnswer: false })).toBe('processing');
    expect(deriveQuestionState({ status: 'processing', hasAnswer: true, latestVerdict: 'accepted' })).toBe(
      'processing',
    );
    expect(deriveQuestionState({ status: 'failed', hasAnswer: false })).toBe('failed');
    expect(deriveQuestionState({ status: 'pending', hasAnswer: false })).toBe('not_generated');
    expect(deriveQuestionState({ status: 'done', hasAnswer: true, latestVerdict: 'accepted' })).toBe('accepted');
    expect(deriveQuestionState({ status: 'done', hasAnswer: true, latestVerdict: 'needs_work' })).toBe('needs_work');
    expect(deriveQuestionState({ status: 'done', hasAnswer: true, latestVerdict: 'wrong_evidence' })).toBe(
      'wrong_evidence',
    );
    expect(deriveQuestionState({ status: 'done', hasAnswer: true })).toBe('draft');
    expect(deriveQuestionState({ status: 'failed', hasAnswer: true })).toBe('draft');
  });
});

describe('RFP create / read API', () => {
  it('creates a confirmed RFP and returns questions in order', async () => {
    const res = await create(ada.cookie, {
      title: 'Acme security',
      questions: [
        { text: 'Do you support SAML SSO?', section: 'Security' },
        { text: 'What is your uptime SLA?' },
      ],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('confirmed');
    expect(body.ownedByMe).toBe(true);
    expect(body.questions.map((q: { seq: number; text: string; section: string | null; reviewState: string }) => ({
      seq: q.seq,
      text: q.text,
      section: q.section,
      reviewState: q.reviewState,
    }))).toEqual([
      { seq: 1, text: 'Do you support SAML SSO?', section: 'Security', reviewState: 'not_generated' },
      { seq: 2, text: 'What is your uptime SLA?', section: null, reviewState: 'not_generated' },
    ]);
    expect(body.questions[0].latestAnswer).toBeNull();
  });

  it('rejects 51 questions, an anonymous caller, and a foreign Origin', async () => {
    const tooMany = await create(ada.cookie, {
      title: 'Too many',
      questions: Array.from({ length: 51 }, (_, i) => ({ text: `Question ${i + 1}` })),
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error.code).toBe('VALIDATION_FAILED');

    const anon = await app.inject(
      asBrowser({ method: 'POST', url: '/api/rfps', payload: { title: 'x', questions: [{ text: 'Q?' }] } }),
    );
    expect(anon.statusCode).toBe(401);

    const origin = await create(ada.cookie, { title: 'x', questions: [{ text: 'Q?' }] }, { origin: 'http://evil.example' });
    expect(origin.statusCode).toBe(403);
    expect(origin.json().error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('lets employee B read A’s RFP and lists only own RFPs when mine=1', async () => {
    const created = await create(ada.cookie, {
      title: 'Ada only',
      questions: [{ text: 'Do you support SAML SSO?' }],
    });
    const id = created.json().id as number;

    const asRei = await app.inject({ method: 'GET', url: `/api/rfps/${id}`, cookies: rei.cookie });
    expect(asRei.statusCode).toBe(200);
    expect(asRei.json()).toMatchObject({ id, title: 'Ada only', ownedByMe: false });

    await create(rei.cookie, { title: 'Rei only', questions: [{ text: 'ISO 27001?' }] });

    const adaMine = await app.inject({ method: 'GET', url: '/api/rfps?mine=1', cookies: ada.cookie });
    expect(adaMine.json().rfps.every((r: { ownedByMe: boolean }) => r.ownedByMe)).toBe(true);
    expect(adaMine.json().rfps.some((r: { title: string }) => r.title === 'Ada only')).toBe(true);
    expect(adaMine.json().rfps.some((r: { title: string }) => r.title === 'Rei only')).toBe(false);

    const missing = await app.inject({ method: 'GET', url: '/api/rfps/999999999', cookies: ada.cookie });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('RFP_NOT_FOUND');
  });

  it('returns the latest answer, sources and reviews on GET', async () => {
    const created = await create(ada.cookie, {
      title: 'With draft',
      questions: [{ text: 'Do you support SAML SSO?' }],
    });
    const questionId = created.json().questions[0].id as number;
    const [answer] = await db()
      .insert(rfpAnswers)
      .values({
        questionId,
        answerText: 'Yes [1].',
        evidenceStatus: 'HIGH_EVIDENCE',
        modelEvidenceStatus: 'HIGH_EVIDENCE',
        model: 'stub',
        promptVersion: 'rfp-v1',
        retrievalMode: 'vector',
      })
      .returning();
    await db()
      .update(rfpQuestions)
      .set({ status: 'done' })
      .where(eq(rfpQuestions.id, questionId));
    await db().insert(rfpAnswerSources).values({
      answerId: answer!.id,
      rank: 1,
      citationNumber: 1,
      documentId: 1,
      versionId: 1,
      title: 'SSO setup guide',
      heading: 'Requirements',
    });
    await db().insert(rfpReviews).values([
      { answerId: answer!.id, verdict: 'needs_work', reviewerId: ada.id, note: 'thin' },
      { answerId: answer!.id, verdict: 'accepted', reviewerId: ada.id, finalText: 'Yes [1].' },
    ]);

    const res = await app.inject({ method: 'GET', url: `/api/rfps/${created.json().id}`, cookies: ada.cookie });
    const q = res.json().questions[0];
    expect(q.reviewState).toBe('accepted');
    expect(q.latestAnswer.answerText).toBe('Yes [1].');
    expect(q.latestAnswer.sources).toEqual([
      expect.objectContaining({ rank: 1, citationNumber: 1, title: 'SSO setup guide' }),
    ]);
    expect(q.latestAnswer.reviews.map((r: { verdict: string }) => r.verdict)).toEqual(['needs_work', 'accepted']);
  });
});
