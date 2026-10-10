import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import { providerCalls, rfpAnswerSources, rfpAnswers, rfpQuestions } from '../src/db/schema.ts';
import { ProviderError } from '../src/llm/errors.ts';
import { stubProvider } from '../src/llm/stub.ts';
import type { Provider } from '../src/llm/types.ts';
import { retrieve, type Passage } from '../src/rag/retrieve.ts';
import { seed } from '../src/seed.ts';
import { applyEvidenceRules, type EvidenceInput } from '../src/services/rfp-answer.service.ts';
import { budgetReached } from '../src/errors.ts';
import { queueDocument } from '../src/services/document-upload.service.ts';
import { failStaleQuestions, runWorker } from '../src/worker.ts';
import { documentVersions } from '../src/db/schema.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';

let app: Awaited<ReturnType<typeof buildTestApp>>;
let hungApp: Awaited<ReturnType<typeof buildTestApp>>;
let ada: Record<string, string>;
let rei: Record<string, string>;
let retrieved: Passage[] = [];
let topDocumentId = 0;
let hang: { promise: Promise<unknown>; resolve: (v: unknown) => void } | null = null;
let failInvalid = false;
let generateCalls = 0;

function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  await runWorker({ once: true });
  const stub = stubProvider();
  const provider: Provider = {
    ...stub,
    generateStructured: async (input, deadline) => {
      generateCalls += 1;
      if (failInvalid) {
        throw new ProviderError('INVALID_OUTPUT', 'malformed', true);
      }
      if (hang) {
        await hang.promise;
      }
      return stub.generateStructured(input, deadline);
    },
  };
  app = await buildTestApp(undefined, undefined, undefined, {
    retrieve: async (vector, opts) => {
      retrieved = await retrieve(vector, opts);
      return retrieved;
    },
  });
  hungApp = await buildTestApp(undefined, undefined, undefined, {
    provider,
    sleep: async () => {},
    retrieve: async (vector, opts) => {
      const passages = await retrieve(vector, opts);
      topDocumentId = passages[0]?.documentId ?? topDocumentId;
      return passages;
    },
  });
  const login = async (target: typeof app, email: string) => {
    const res = await target.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
    );
    return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  };
  ada = await login(app, 'ada@omena.example');
  rei = await login(app, 'rei@omena.example');
});

afterAll(async () => {
  await app.close();
  await hungApp.close();
});

async function createQuestion(
  target: typeof app,
  cookie: Record<string, string>,
  text: string,
) {
  const res = await target.inject(
    asBrowser({
      method: 'POST',
      url: '/api/rfps',
      cookies: cookie,
      payload: { title: text, questions: [{ text }] },
    }),
  );
  expect(res.statusCode).toBe(201);
  return { rfpId: res.json().id as number, questionId: res.json().questions[0].id as number };
}

const regen = (target: typeof app, cookie: Record<string, string>, questionId: number) =>
  target.inject(asBrowser({ method: 'POST', url: `/api/rfp-questions/${questionId}/regenerate`, cookies: cookie }));

async function waitUntil(check: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < 250; i++) {
    if (await check()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('applyEvidenceRules', () => {
  const base = (over: Partial<EvidenceInput>): EvidenceInput => ({
    modelStatus: 'HIGH_EVIDENCE',
    passageCount: 2,
    invalidCitationRemoved: false,
    validCitationCount: 1,
    gaps: [],
    ...over,
  });

  it('covers every REQ_V3 §8 row', () => {
    expect(applyEvidenceRules(base({ passageCount: 0, validCitationCount: 0 }))).toEqual({
      evidenceStatus: 'INSUFFICIENT_EVIDENCE',
      reviewReasons: [],
    });
    expect(applyEvidenceRules(base({ invalidCitationRemoved: true }))).toEqual({
      evidenceStatus: 'PARTIAL_EVIDENCE',
      reviewReasons: ['invalid_citation_removed'],
    });
    expect(
      applyEvidenceRules(base({ invalidCitationRemoved: true, validCitationCount: 0 })),
    ).toEqual({
      evidenceStatus: 'INSUFFICIENT_EVIDENCE',
      reviewReasons: ['invalid_citation_removed', 'no_valid_citation'],
    });
    expect(applyEvidenceRules(base({ modelStatus: 'INSUFFICIENT_EVIDENCE', validCitationCount: 0 }))).toEqual({
      evidenceStatus: 'INSUFFICIENT_EVIDENCE',
      reviewReasons: [],
    });
    expect(applyEvidenceRules(base({ gaps: ['No uptime figure'] }))).toEqual({
      evidenceStatus: 'PARTIAL_EVIDENCE',
      reviewReasons: ['gaps_reported'],
    });
    expect(applyEvidenceRules(base({ modelStatus: 'PARTIAL_EVIDENCE' }))).toEqual({
      evidenceStatus: 'PARTIAL_EVIDENCE',
      reviewReasons: [],
    });
    expect(applyEvidenceRules(base({}))).toEqual({ evidenceStatus: 'HIGH_EVIDENCE', reviewReasons: [] });
  });
});

describe.sequential('answerQuestion', () => {
  it('answers a seeded-KB question with one citation and every retrieved passage', async () => {
    const { questionId } = await createQuestion(app, ada, 'Do you support SAML SSO?');
    const res = await regen(app, ada, questionId);
    expect(res.statusCode).toBe(200);
    const question = res.json().questions[0];
    expect(question.status).toBe('done');
    expect(question.latestAnswer.answerText).toMatch(/\[1\]/);
    expect(question.latestAnswer.model).toBe('stub:rfp');
    expect(question.latestAnswer.evidenceStatus).toBe('HIGH_EVIDENCE');

    const sources = await db().select().from(rfpAnswerSources).where(eq(rfpAnswerSources.answerId, question.latestAnswer.id));
    expect(sources).toHaveLength(retrieved.length);
    expect(retrieved.length).toBeGreaterThan(0);
    const cited = sources.filter((s) => s.citationNumber != null);
    expect(cited).toEqual([expect.objectContaining({ citationNumber: 1 })]);
  });

  it('saves a fixed insufficient answer and skips the model when nothing is retrieved', async () => {
    const isolated = await buildTestApp(undefined, undefined, undefined, { retrieve: async () => [] });
    const { questionId } = await createQuestion(isolated, ada, 'No matching passage at all');
    const res = await regen(isolated, ada, questionId);
    expect(res.statusCode).toBe(200);
    const answer = res.json().questions[0].latestAnswer;
    expect(answer.evidenceStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(answer.model).toBe('none');
    expect(answer.answerText).toMatch(/doesn't contain enough evidence/);
    const calls = await db().select().from(providerCalls).where(eq(providerCalls.rfpQuestionId, questionId));
    expect(calls.filter((c) => c.kind === 'rfp_generate')).toHaveLength(0);
    await isolated.close();
  });

  it('fails the question after three invalid outputs and clears the lock', async () => {
    failInvalid = true;
    generateCalls = 0;
    try {
      const { questionId } = await createQuestion(hungApp, ada, 'Invalid output question');
      const res = await regen(hungApp, ada, questionId);
      expect(res.statusCode).toBe(200);
      expect(generateCalls).toBe(3);
      const [question] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
      expect(question).toMatchObject({ status: 'failed', errorCode: 'INVALID_OUTPUT', generationToken: null });
      const calls = await db().select().from(providerCalls).where(eq(providerCalls.rfpQuestionId, questionId));
      const generated = calls.filter((c) => c.kind === 'rfp_generate');
      expect(generated).toHaveLength(3);
      expect(generated.every((c) => c.errorCode === 'INVALID_OUTPUT')).toBe(true);
      expect(await db().select().from(rfpAnswers).where(eq(rfpAnswers.questionId, questionId))).toHaveLength(0);
    } finally {
      failInvalid = false;
    }
  });

  it('returns 409 while a question is queued and does not take the lock', async () => {
    const { questionId } = await createQuestion(app, ada, 'Queued question');
    await db().update(rfpQuestions).set({ status: 'queued' }).where(eq(rfpQuestions.id, questionId));
    const res = await regen(app, ada, questionId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GENERATION_IN_PROGRESS');
    const [question] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
    expect(question).toMatchObject({ status: 'queued', generationToken: null });
  });

  it('returns 403 to another employee and writes nothing', async () => {
    const { questionId } = await createQuestion(app, ada, 'Owned by Ada');
    const before = await db().select().from(rfpAnswers);
    const res = await regen(app, rei, questionId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_OWNER');
    const [question] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
    expect(question).toMatchObject({ status: 'pending', generationToken: null });
    expect(await db().select().from(rfpAnswers)).toHaveLength(before.length);
  });

  it('returns 409 while a fresh lock is held', async () => {
    hang = deferred();
    const { questionId } = await createQuestion(hungApp, ada, 'In progress');
    const first = regen(hungApp, ada, questionId);
    await waitUntil(async () => {
      const [row] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
      return !!row?.generationToken;
    }, 'lock');
    const second = await regen(hungApp, ada, questionId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('GENERATION_IN_PROGRESS');
    hang.resolve(null);
    expect((await first).statusCode).toBe(200);
    hang = null;
  });

  it('does not let a taken-over token save or clear the new lock', async () => {
    hang = deferred();
    const calls = generateCalls;
    const { questionId } = await createQuestion(hungApp, ada, 'Takeover');
    const first = regen(hungApp, ada, questionId);
    await waitUntil(async () => {
      const [row] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
      return generateCalls > calls && !!row?.generationToken;
    }, 'first generate call');
    const [locked] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
    await db()
      .update(rfpQuestions)
      .set({ generationStartedAt: new Date(Date.now() - 3 * 60_000) })
      .where(eq(rfpQuestions.id, questionId));

    const secondHang = deferred();
    const original = hang;
    hang = secondHang;
    const second = regen(hungApp, ada, questionId);
    await waitUntil(async () => {
      const [row] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
      return !!row?.generationToken && row.generationToken !== locked!.generationToken;
    }, 'second request to take over the lock');
    original.resolve(null);
    const stale = await first;
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('LOCK_TAKEN');
    expect(await db().select().from(rfpAnswers).where(eq(rfpAnswers.questionId, questionId))).toHaveLength(0);
    const [after] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
    expect(after!.generationToken).toBeTruthy();
    expect(after!.generationToken).not.toBe(locked!.generationToken);

    hang = null;
    secondHang.resolve(null);
    expect((await second).statusCode).toBe(200);
  });

  it('archives a cited document immediately while generate is blocked', async () => {
    hang = deferred();
    const calls = generateCalls;
    const { questionId } = await createQuestion(hungApp, ada, 'Do you support SAML SSO?');
    const pending = regen(hungApp, ada, questionId);
    await waitUntil(async () => {
      const [row] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, questionId));
      return generateCalls > calls && !!row?.generationToken && topDocumentId > 0;
    }, 'blocked generate');
    const started = Date.now();
    const archived = await hungApp.inject(
      asBrowser({ method: 'POST', url: `/api/documents/${topDocumentId}/archive`, cookies: ada }),
    );
    expect(archived.statusCode).toBe(200);
    expect(Date.now() - started).toBeLessThan(500);
    hang.resolve(null);
    await pending;
    hang = null;
    await hungApp.inject(asBrowser({ method: 'POST', url: `/api/documents/${topDocumentId}/restore`, cookies: ada }));
  });
});

describe('background processing (PROC-01..03)', () => {
  const calls: string[] = [];
  const stub = stubProvider();
  const workerProvider = (opts: { failOn?: string; budget?: boolean; onGenerate?: () => Promise<void> } = {}): Provider => ({
    ...stub,
    embedQuery: async (text, deadline) => {
      if (opts.budget) {
        throw budgetReached();
      }
      return stub.embedQuery(text, deadline);
    },
    generateStructured: async (input, deadline) => {
      calls.push(input.prompt);
      await opts.onGenerate?.();
      if (opts.failOn && input.prompt.includes(opts.failOn)) {
        throw new ProviderError('INVALID_OUTPUT', 'malformed', true);
      }
      return stub.generateStructured(input, deadline);
    },
  });
  const rfpDeps = (p: Provider) => ({ provider: p, sleep: async () => {} });

  const createRfp = async (texts: string[], cookie = ada) => {
    // earlier tests leave stray queued rows; park them so only this test's questions run
    await db().update(rfpQuestions).set({ status: 'pending' }).where(eq(rfpQuestions.status, 'queued'));
    calls.length = 0;
    const res = await app.inject(
      asBrowser({
        method: 'POST',
        url: '/api/rfps',
        cookies: cookie,
        payload: { title: texts[0], questions: texts.map((text) => ({ text })) },
      }),
    );
    return res.json() as { id: number; questions: { id: number }[] };
  };
  const generate = (id: number, cookie = ada, query = '') =>
    app.inject(asBrowser({ method: 'POST', url: `/api/rfps/${id}/generate${query}`, cookies: cookie }));
  const statuses = async (ids: number[]) =>
    (await db().select().from(rfpQuestions).where(inArray(rfpQuestions.id, ids)).orderBy(rfpQuestions.seq)).map(
      (q) => q.status,
    );
  const answerCount = async (id: number) =>
    (await db().select().from(rfpAnswers).where(eq(rfpAnswers.questionId, id))).length;

  it('PROC-01: a failed question is isolated and retryable; generate twice queues nothing new', async () => {
    const rfp = await createRfp(['Do you support SAML SSO?', 'FAILME marker question', 'What is the refund window?']);
    const ids = rfp.questions.map((q) => q.id);
    const first = await generate(rfp.id);
    expect(first.json().progress).toMatchObject({ queued: 3, pending: 0, total: 3 });
    expect((await generate(rfp.id)).json().progress).toMatchObject({ queued: 3 });

    await runWorker({ once: true, rfp: rfpDeps(workerProvider({ failOn: 'FAILME' })) });
    expect(await statuses(ids)).toEqual(['done', 'failed', 'done']);
    const failed = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, ids[1]!));
    expect(failed[0]!.errorCode).toBe('INVALID_OUTPUT');
    expect((await generate(rfp.id)).json().progress).toMatchObject({ queued: 1, done: 2 });

    // retry the failed one synchronously (stub in hungApp does not fail on the marker)
    await db().update(rfpQuestions).set({ status: 'failed' }).where(eq(rfpQuestions.id, ids[1]!));
    expect((await regen(hungApp, ada, ids[1]!)).statusCode).toBe(200);
    expect(await statuses(ids)).toEqual(['done', 'done', 'done']);
    expect(await Promise.all(ids.map(answerCount))).toEqual([1, 1, 1]);
  });

  it('generate is creator-only and needs a confirmed RFP', async () => {
    const rfp = await createRfp(['Creator only?']);
    expect((await generate(rfp.id, rei)).statusCode).toBe(403);
    const draft = await app.inject(
      asBrowser({ method: 'POST', url: '/api/rfps', cookies: ada, payload: { title: 'd', text: '1. Draft?' } }),
    );
    const res = await generate(draft.json().id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RFP_NOT_CONFIRMED');
  });

  it('PROC-02: two concurrent workers answer each question exactly once', async () => {
    const rfp = await createRfp(['Q one SSO?', 'Q two refund?', 'Q three webhooks?', 'Q four plans?']);
    const ids = rfp.questions.map((q) => q.id);
    await generate(rfp.id);
    const deps = rfpDeps(workerProvider({ onGenerate: () => new Promise((r) => setTimeout(r, 30)) }));
    await Promise.all([runWorker({ once: true, rfp: deps }), runWorker({ once: true, rfp: deps })]);
    expect(await statuses(ids)).toEqual(['done', 'done', 'done', 'done']);
    expect(await Promise.all(ids.map(answerCount))).toEqual([1, 1, 1, 1]);
    expect(calls).toHaveLength(4);
  });

  it('PROC-02: a stale processing question is re-queued, then failed as stale after 3 attempts', async () => {
    const rfp = await createRfp(['Stale one?', 'Stale two?']);
    const [a, b] = rfp.questions.map((q) => q.id) as [number, number];
    const old = new Date(Date.now() - 3 * 60_000);
    const token = '00000000-0000-4000-8000-000000000001';
    await db().update(rfpQuestions).set({ status: 'processing', generationToken: token, generationStartedAt: old, attempts: 1 }).where(eq(rfpQuestions.id, a));
    await db().update(rfpQuestions).set({ status: 'processing', generationToken: token, generationStartedAt: old, attempts: 3 }).where(eq(rfpQuestions.id, b));
    expect(await failStaleQuestions()).toBe(2);
    const rows = await db().select().from(rfpQuestions).where(inArray(rfpQuestions.id, [a, b])).orderBy(rfpQuestions.seq);
    expect(rows.map((r) => [r.status, r.errorCode, r.generationToken])).toEqual([
      ['queued', null, null],
      ['failed', 'stale', null],
    ]);
  });

  it('claims KB versions before RFP questions', async () => {
    const rfp = await createRfp(['Which doc comes first?']);
    await generate(rfp.id);
    const { version } = await queueDocument({
      title: 'Worker order doc',
      category: 'Plans',
      effectiveAt: '2026-10-01',
      filename: 'order.md',
      bytes: Buffer.from('# Order\n\nVersions are indexed before questions.\n'),
      employeeId: null,
    });
    let versionStatusAtGenerate = '';
    await runWorker({
      once: true,
      rfp: rfpDeps(
        workerProvider({
          onGenerate: async () => {
            const [v] = await db().select().from(documentVersions).where(eq(documentVersions.id, version.id));
            versionStatusAtGenerate = v!.indexingStatus;
          },
        }),
      ),
    });
    expect(versionStatusAtGenerate).not.toBe('queued');
    expect(versionStatusAtGenerate).not.toBe('processing');
  });

  it('PROC-03: budget_reached fails one question and leaves the rest queued', async () => {
    const rfp = await createRfp(['Budget one?', 'Budget two?', 'Budget three?']);
    const ids = rfp.questions.map((q) => q.id);
    await generate(rfp.id);
    await runWorker({ once: true, rfp: rfpDeps(workerProvider({ budget: true })) });
    expect(await statuses(ids)).toEqual(['failed', 'queued', 'queued']);
    const [first] = await db().select().from(rfpQuestions).where(eq(rfpQuestions.id, ids[0]!));
    expect(first!.errorCode).toBe('budget_reached');
    expect(await Promise.all(ids.map(answerCount))).toEqual([0, 0, 0]);
  });
});
