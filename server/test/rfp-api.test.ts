import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import { employees, rfps, rfpAnswerSources, rfpAnswers, rfpQuestions, rfpReviews } from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';
import { deriveQuestionState } from '../src/services/rfp-state.ts';
import { buildPdf } from '../src/ingest/extract/pdfBytes.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';
import { multipart } from './helpers/multipart.ts';

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

  it('caps the RFP list at 100, newest first', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      title: `Bulk ${i}`,
      sourceKind: 'paste',
      status: 'confirmed',
      createdBy: ada.id,
    }));
    await db().insert(rfps).values(rows);
    const res = await app.inject({ method: 'GET', url: '/api/rfps?mine=0', cookies: ada.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json().rfps).toHaveLength(100);
    expect(res.json().rfps[0].title).toBe('Bulk 100');
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

describe('RFP intake and draft editing', () => {
  const json = (cookie: Record<string, string>, method: 'POST' | 'PUT', url: string, payload?: unknown) =>
    app.inject(asBrowser({ method, url, cookies: cookie, payload: payload as object }));
  const upload = (title: string, file: { name: string; bytes: Buffer }) => {
    const body = multipart({ title }, file);
    return app.inject(
      asBrowser({ method: 'POST', url: '/api/rfps', cookies: ada.cookie, headers: body.headers, payload: body.payload }),
    );
  };

  it('extracts pasted text into a draft, then edit, confirm and lock', async () => {
    const res = await json(ada.cookie, 'POST', '/api/rfps', { title: 'Pasted', text: '## Sec\n1. Do you support SAML?\n2. Uptime SLA?' });
    expect(res.statusCode).toBe(201);
    const rfp = res.json();
    expect(rfp.status).toBe('draft');
    expect(rfp.questions.map((q: { text: string; section: string }) => [q.text, q.section])).toEqual([
      ['Do you support SAML?', 'Sec'],
      ['Uptime SLA?', 'Sec'],
    ]);

    const edited = await json(ada.cookie, 'PUT', `/api/rfps/${rfp.id}/questions`, {
      questions: [{ text: 'Uptime SLA?' }, { text: 'Added by hand', section: 'Extra' }],
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().questions.map((q: { seq: number; text: string }) => [q.seq, q.text])).toEqual([
      [1, 'Uptime SLA?'],
      [2, 'Added by hand'],
    ]);

    const asRei = await json(rei.cookie, 'PUT', `/api/rfps/${rfp.id}/questions`, { questions: [{ text: 'Hijack?' }] });
    expect(asRei.statusCode).toBe(403);
    expect((await json(rei.cookie, 'POST', `/api/rfps/${rfp.id}/confirm`)).statusCode).toBe(403);

    const confirmed = await json(ada.cookie, 'POST', `/api/rfps/${rfp.id}/confirm`);
    expect(confirmed.json().status).toBe('confirmed');
    expect((await json(ada.cookie, 'PUT', `/api/rfps/${rfp.id}/questions`, { questions: [{ text: 'Late?' }] })).statusCode).toBe(409);
    expect((await json(ada.cookie, 'POST', `/api/rfps/${rfp.id}/extract`)).statusCode).toBe(409);
  });

  it('refuses to generate a question of an unconfirmed RFP', async () => {
    const res = await json(ada.cookie, 'POST', '/api/rfps', { title: 'Unconfirmed', text: '1. Do you support SAML SSO?' });
    const qid = res.json().questions[0].id;
    const gen = await json(ada.cookie, 'POST', `/api/rfp-questions/${qid}/regenerate`);
    expect(gen.statusCode).toBe(409);
    expect(gen.json().error.code).toBe('RFP_NOT_CONFIRMED');
  });

  it('confirm with zero questions → 409; paste with no questions stays a draft', async () => {
    const res = await json(ada.cookie, 'POST', '/api/rfps', { title: 'Empty', text: 'Nothing to see here.' });
    expect(res.json()).toMatchObject({ status: 'draft', questions: [] });
    const confirm = await json(ada.cookie, 'POST', `/api/rfps/${res.json().id}/confirm`);
    expect(confirm.statusCode).toBe(409);
    expect(confirm.json().error.code).toBe('NO_QUESTIONS');
  });

  it('re-runs extraction and rejects > 50 questions', async () => {
    const res = await json(ada.cookie, 'POST', '/api/rfps', { title: 'Redo', text: '1. A?\n2. B?' });
    await json(ada.cookie, 'PUT', `/api/rfps/${res.json().id}/questions`, { questions: [{ text: 'Only?' }] });
    const again = await json(ada.cookie, 'POST', `/api/rfps/${res.json().id}/extract`);
    expect(again.json().questions.map((q: { text: string }) => q.text)).toEqual(['A?', 'B?']);

    const many = Array.from({ length: 51 }, (_, i) => `${i + 1}. Q${i}?`).join('\n');
    const tooMany = await json(ada.cookie, 'POST', '/api/rfps', { title: 'Many', text: many });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error.code).toBe('TOO_MANY_QUESTIONS');
  });

  it('accepts a Markdown upload, rejects a PNG renamed .pdf, fails an image-only PDF', async () => {
    const md = await upload('MD', { name: 'q.md', bytes: Buffer.from('# Sec\n- Do you encrypt data?\n') });
    expect(md.statusCode).toBe(201);
    expect(md.json()).toMatchObject({ status: 'draft', sourceKind: 'file' });
    expect(md.json().questions[0]).toMatchObject({ text: 'Do you encrypt data?', section: 'Sec' });

    const pdf = await upload('PDF', { name: 'q.pdf', bytes: buildPdf(['1. Do you support SSO?']) });
    expect(pdf.json().questions.map((q: { text: string }) => q.text)).toEqual(['Do you support SSO?']);

    const png = await upload('PNG', { name: 'q.pdf', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) });
    expect(png.statusCode).toBe(400);

    const scan = await upload('Scan', { name: 'scan.pdf', bytes: buildPdf(['']) });
    expect(scan.statusCode).toBe(201);
    expect(scan.json()).toMatchObject({
      status: 'extraction_failed',
      extractionError: "No page has a text layer. OCR isn't supported.",
    });
    const rescue = await json(ada.cookie, 'POST', `/api/rfps/${scan.json().id}/extract`, { text: '1. Pasted instead?' });
    expect(rescue.json()).toMatchObject({ status: 'draft', extractionError: null });
  });
});
