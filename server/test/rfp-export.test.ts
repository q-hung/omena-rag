import { parse } from 'csv-parse/sync';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { rfpAnswers } from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { runWorker } from '../src/worker.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';
import { eq } from 'drizzle-orm';

const PASSWORD = 'test-password';
let app: Awaited<ReturnType<typeof buildTestApp>>;
let ada: Record<string, string>;
let rei: Record<string, string>;

const call = (cookies: Record<string, string> | undefined, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  app.inject(asBrowser({ method, url, cookies, payload: payload as object }));

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  await runWorker({ once: true });
  app = await buildTestApp();
  const login = async (email: string) => {
    const res = await app.inject(asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }));
    return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  };
  ada = await login('ada@omena.example');
  rei = await login('rei@omena.example');
});
afterAll(async () => {
  await app.close();
});

/** One RFP; every question is generated (stub answers cite [1]). Returns ids in question order. */
async function generated(questions: string[]) {
  const created = await call(ada, 'POST', '/api/rfps', { title: 'Export test', questions: questions.map((text) => ({ text })) });
  for (const q of created.json().questions) {
    await call(ada, 'POST', `/api/rfp-questions/${q.id}/regenerate`);
  }
  const rfp = (await call(ada, 'GET', `/api/rfps/${created.json().id}`)).json();
  return { rfpId: rfp.id as number, answers: rfp.questions.map((q: { latestAnswer: { id: number; answerText: string } }) => q.latestAnswer) };
}
const review = (answerId: number, payload: object) => call(ada, 'POST', `/api/rfp-answers/${answerId}/reviews`, payload);
const exportOf = (rfpId: number, format: 'md' | 'csv', cookies: Record<string, string> | null = ada) =>
  call(cookies ?? undefined, 'GET', `/api/rfps/${rfpId}/export?format=${format}`);

describe.sequential('GET /api/rfps/:id/export (REV-05)', () => {
  it('exports accepted final_text without markers in question order; a draft or a reversed review never appears', async () => {
    const { rfpId, answers } = await generated(['Do you support SAML SSO?', 'How is data encrypted at rest?', 'Which subprocessors do you use?', 'How long are logs kept?']);
    await call(ada, 'PATCH', `/api/rfp-answers/${answers[0].id}`, { editedText: 'Reviewer wording for SSO [1].' });
    await review(answers[0].id, { verdict: 'accepted' });
    await review(answers[1].id, { verdict: 'accepted' });
    await review(answers[1].id, { verdict: 'needs_work' }); // later review reverses acceptance
    await review(answers[2].id, { verdict: 'accepted' });
    // answers[3] stays an unreviewed draft

    const res = await exportOf(rfpId, 'md');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="rfp-${rfpId}.md"`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const md = res.body;
    expect(md).toContain('Reviewer wording for SSO.');
    expect(md).not.toMatch(/\[\d+\]/);
    expect(md).not.toContain(answers[1].answerText.replace(/ ?\[\d+\]/g, ''));
    expect(md).not.toContain(answers[3].answerText.replace(/ ?\[\d+\]/g, ''));
    expect(md.match(/_Not answered_/g)).toHaveLength(2);
    expect(md.indexOf('Q1.')).toBeLessThan(md.indexOf('Q2.'));
    expect(md.indexOf('Q3.')).toBeLessThan(md.indexOf('Q4.'));
    expect(md).toMatch(/Sources: .+ v\d+/);
  });

  it('lists only the sources the final text still cites', async () => {
    const { rfpId, answers } = await generated(['Do you support SAML SSO?']);
    await call(ada, 'PATCH', `/api/rfp-answers/${answers[0].id}`, { editedText: 'Yes, on Enterprise.' });
    await review(answers[0].id, { verdict: 'accepted' });
    expect((await exportOf(rfpId, 'md')).body).not.toContain('Sources:');
  });

  it('CSV with commas, quotes, newlines and a formula-like cell round-trips through a standard parser', async () => {
    const { rfpId, answers } = await generated(['Plain question?', '=SUM(1,2) is a formula-like question?']);
    const nasty = 'Yes, "quoted", and\nsecond line [1].';
    await call(ada, 'PATCH', `/api/rfp-answers/${answers[0].id}`, { editedText: nasty });
    await review(answers[0].id, { verdict: 'accepted' });

    const res = await exportOf(rfpId, 'csv');
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="rfp-${rfpId}.csv"`);
    const rows = parse(res.body, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Q: '1', Question: 'Plain question?', Answer: 'Yes, "quoted", and\nsecond line.' });
    expect(rows[1]).toMatchObject({ Answer: 'Not answered' });
    // Spreadsheet formula injection: a leading = is neutralised.
    expect(rows[1]!.Question).toBe("'=SUM(1,2) is a formula-like question?");
  });

  it('is readable by any employee, 401 without a session, 404 for an unknown RFP, 400 for a bad format', async () => {
    const { rfpId } = await generated(['Do you support SAML SSO?']);
    expect((await exportOf(rfpId, 'md', rei)).statusCode).toBe(200);
    expect((await exportOf(rfpId, 'md', null)).statusCode).toBe(401);
    expect((await exportOf(999_999, 'md')).statusCode).toBe(404);
    expect((await call(ada, 'GET', `/api/rfps/${rfpId}/export?format=pdf`)).statusCode).toBe(400);
  });

  it('defaults to Markdown and never exports an answer whose latest answer row has no accepted review', async () => {
    const { rfpId, answers } = await generated(['Do you support SAML SSO?']);
    await review(answers[0].id, { verdict: 'accepted' });
    // A newer answer (regenerate) replaces the accepted one, so the question is no longer accepted.
    const [q] = (await call(ada, 'GET', `/api/rfps/${rfpId}`)).json().questions;
    await call(ada, 'POST', `/api/rfp-questions/${q.id}/regenerate`);
    expect((await db().select().from(rfpAnswers).where(eq(rfpAnswers.questionId, q.id))).length).toBe(2);
    const res = await call(ada, 'GET', `/api/rfps/${rfpId}/export`);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
    expect(res.body).toContain('_Not answered_');
  });
});
