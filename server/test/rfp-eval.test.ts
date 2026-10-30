import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { seed } from '../src/seed.ts';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { getRfpFeedback } from '../src/services/rfp-feedback.service.ts';
import { runWorker } from '../src/worker.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';
import {
  loadRfpGolden,
  rfpTargetsMet,
  scoreRfpCase,
  summarizeRfp,
  type RfpCaseGot,
  type RfpGoldenCase,
} from '../eval/rfp-score.ts';

const spec = (over: Partial<RfpGoldenCase> = {}): RfpGoldenCase => ({
  id: 'R99',
  question: 'q',
  expectedStatus: 'HIGH_EVIDENCE',
  expectedDocuments: ['Security overview'],
  forbiddenPatterns: [],
  ...over,
});
const got = (over: Partial<RfpCaseGot> = {}): RfpCaseGot => ({
  status: 'HIGH_EVIDENCE',
  modelStatus: 'HIGH_EVIDENCE',
  text: 'Yes [1].',
  retrievedTitles: ['Security overview'],
  reviewReasons: [],
  ...over,
});

describe('rfp-golden.json (RFP-EVAL-01)', () => {
  it('has 12-15 cases with the required mix, an injection and exact-token questions', async () => {
    const cases = await loadRfpGolden();
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect(cases.length).toBeLessThanOrEqual(15);
    const by = (s: string) => cases.filter((c) => c.expectedStatus === s).length;
    expect(by('HIGH_EVIDENCE')).toBeGreaterThanOrEqual(3);
    expect(by('PARTIAL_EVIDENCE')).toBeGreaterThanOrEqual(2);
    expect(by('INSUFFICIENT_EVIDENCE')).toBeGreaterThanOrEqual(3);
    expect(cases.some((c) => /ignore all previous instructions/i.test(c.question))).toBe(true);
    expect(cases.some((c) => /AES-256/.test(c.question))).toBe(true);
    expect(cases.some((c) => /SOC 2/.test(c.question))).toBe(true);
    // Unanswerable cases name no document, so they never count towards the hit rate.
    expect(cases.filter((c) => c.expectedStatus === 'INSUFFICIENT_EVIDENCE').every((c) => c.expectedDocuments.length === 0)).toBe(true);
  });
});

describe('scoreRfpCase', () => {
  it('scores a hit, a miss, and no expected document', () => {
    expect(scoreRfpCase(spec(), got()).hit).toBe(true);
    expect(scoreRfpCase(spec(), got({ retrievedTitles: ['Billing FAQ'] })).hit).toBe(false);
    expect(scoreRfpCase(spec({ expectedDocuments: [] }), got()).hit).toBeNull();
    expect(scoreRfpCase(spec({ expectedDocuments: ['A', 'Security overview'] }), got()).hit).toBe(true);
  });

  it('matches forbidden patterns case-insensitively and with word boundaries for single words', () => {
    const forbidden = spec({ forbiddenPatterns: ['we are SOC 2', 'yes'] });
    expect(scoreRfpCase(forbidden, got({ text: 'We are soc 2 certified.' })).forbiddenHits).toEqual(['we are SOC 2']);
    expect(scoreRfpCase(forbidden, got({ text: 'yesterday' })).forbiddenHits).toEqual([]);
  });

  it('flags a server downgrade, removed citations, and INSUFFICIENT answered as HIGH', () => {
    const downgraded = scoreRfpCase(spec(), got({ status: 'PARTIAL_EVIDENCE', reviewReasons: ['invalid_citation_removed'] }));
    expect(downgraded).toMatchObject({ downgraded: true, removedCitations: 1, statusOk: false, unsafeHigh: false });
    const unsafe = scoreRfpCase(spec({ expectedStatus: 'INSUFFICIENT_EVIDENCE' }), got());
    expect(unsafe).toMatchObject({ unsafeHigh: true, statusOk: false });
    expect(scoreRfpCase(spec(), got({ status: 'FAILED', modelStatus: 'FAILED' })).downgraded).toBe(false);
  });
});

describe('summarizeRfp', () => {
  it('builds the confusion matrix, rates and failures; targets need SC3-1..3', () => {
    const scores = [
      scoreRfpCase(spec({ id: 'a' }), got()),
      scoreRfpCase(spec({ id: 'b' }), got({ status: 'PARTIAL_EVIDENCE' })),
      scoreRfpCase(spec({ id: 'c', expectedStatus: 'INSUFFICIENT_EVIDENCE', expectedDocuments: [] }), got({ status: 'INSUFFICIENT_EVIDENCE', modelStatus: 'INSUFFICIENT_EVIDENCE', retrievedTitles: [] })),
      scoreRfpCase(spec({ id: 'd', expectedStatus: 'PARTIAL_EVIDENCE' }), got({ status: 'FAILED', modelStatus: 'FAILED', retrievedTitles: [] })),
    ];
    const t = summarizeRfp(scores);
    expect(t).toMatchObject({ hitN: 2, hitD: 3, statusN: 2, statusD: 4, failures: 1, unsafeHigh: 0, forbiddenHits: 0 });
    expect(t.statusAccuracy).toBe(0.5);
    expect(t.confusion.HIGH_EVIDENCE).toMatchObject({ HIGH_EVIDENCE: 1, PARTIAL_EVIDENCE: 1 });
    expect(t.confusion.PARTIAL_EVIDENCE).toMatchObject({ FAILED: 1 });
    expect(rfpTargetsMet(t)).toBe(false);

    const good = summarizeRfp([scoreRfpCase(spec(), got())]);
    expect(rfpTargetsMet(good)).toBe(true);
    expect(rfpTargetsMet({ ...good, unsafeHigh: 1 })).toBe(false);
    expect(rfpTargetsMet({ ...good, forbiddenHits: 1 })).toBe(false);
  });
});

describe('pnpm eval:rfp', () => {
  it('exits before touching the database when LLM_PROVIDER=stub', () => {
    const result = spawnSync(process.execPath, ['eval/rfp-run.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, LLM_PROVIDER: 'stub' },
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/eval:rfp refuses stub/);
  });
});

describe.sequential('getRfpFeedback (RFP-EVAL-03)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let cookies: Record<string, string>;
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject(asBrowser({ method, url, cookies, payload: payload as object }));

  beforeAll(async () => {
    await seed(db(), { date: '2026-10-02', password: 'test-password' });
    await runWorker({ once: true });
    app = await buildTestApp();
    const login = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email: 'ada@omena.example', password: 'test-password' } }),
    );
    cookies = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  });
  afterAll(async () => {
    await app.close();
  });

  async function answered(text: string) {
    const created = await call('POST', '/api/rfps', { title: text, questions: [{ text }] });
    await call('POST', `/api/rfp-questions/${created.json().questions[0].id}/regenerate`);
    const q = (await call('GET', `/api/rfps/${created.json().id}`)).json().questions[0];
    return q.latestAnswer as { id: number; evidenceStatus: string };
  }
  const review = (answerId: number, payload: object) => call('POST', `/api/rfp-answers/${answerId}/reviews`, payload);

  it('counts the latest review per answer, splits accepted as-is vs after edit, and groups flagged citations by document', async () => {
    const before = await getRfpFeedback();
    const count = (f: typeof before, v: string) => f.verdicts.find((x) => x.verdict === v)?.count ?? 0;
    const flagged = (f: typeof before) => f.wrongEvidenceByDocument.reduce((n, d) => n + d.count, 0);

    const asIs = await answered('Do you support SAML SSO?');
    expect((await review(asIs.id, { verdict: 'accepted' })).statusCode).toBe(201);

    const edited = await answered('How is customer data encrypted at rest?');
    await call('PATCH', `/api/rfp-answers/${edited.id}`, { editedText: 'Edited by a reviewer [1].' });
    await review(edited.id, { verdict: 'accepted' });

    const superseded = await answered('How long do you keep webhook logs?');
    await review(superseded.id, { verdict: 'needs_work', note: 'Too vague' });
    await review(superseded.id, { verdict: 'wrong_evidence', flaggedCitations: [1] });

    const after = await getRfpFeedback();
    expect(count(after, 'accepted') - count(before, 'accepted')).toBe(2);
    // The needs_work review was replaced by the later wrong_evidence one.
    expect(count(after, 'needs_work')).toBe(count(before, 'needs_work'));
    expect(count(after, 'wrong_evidence') - count(before, 'wrong_evidence')).toBe(1);
    const acc = (f: typeof before, k: 'acceptedAsIs' | 'acceptedAfterEdit') => f.verdicts.find((x) => x.verdict === 'accepted')?.[k] ?? 0;
    expect(acc(after, 'acceptedAsIs') - acc(before, 'acceptedAsIs')).toBe(1);
    expect(acc(after, 'acceptedAfterEdit') - acc(before, 'acceptedAfterEdit')).toBe(1);
    expect(flagged(after) - flagged(before)).toBe(1);

    const status = after.acceptanceByEvidenceStatus.find((e) => e.evidenceStatus === asIs.evidenceStatus)!;
    expect(status.reviewed).toBeGreaterThanOrEqual(3);
    expect(status.accepted).toBeGreaterThanOrEqual(2);
  });
});
