import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth.ts';
import { db } from '../src/db/index.ts';
import {
  accounts,
  answers,
  answerSources,
  conversations,
  documentChunks,
  documentVersions,
  documents,
  employees,
  providerCalls,
  turns,
} from '../src/db/schema.ts';
import { ProviderError } from '../src/llm/errors.ts';
import { stubProvider } from '../src/llm/stub.ts';
import type { Provider } from '../src/llm/types.ts';
import { utcToday } from '../src/lib/format.ts';
import type { Passage } from '../src/retrieve.ts';
import { seed } from '../src/seed.ts';
import { queueDocument } from '../src/upload.ts';
import { asBrowser, buildTestApp, LogCapture } from './helpers/app.ts';

const PASSWORD = 'test-password';
const unit = () => {
  const v = new Array<number>(768).fill(0);
  v[0] = 1;
  return v;
};

let ada: { cookie: Record<string, string>; id: number };
let rei: { cookie: Record<string, string>; id: number };
let accountId: number;
let passage: Passage;
let documentId: number;
let generateCalls = 0;
let hang: { promise: Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null;
let failNext = false;
let hangUntilDeadline = false;
let attemptStarts: number[] = [];

function deferred() {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const output = {
  outcome: 'answer' as const,
  answer: 'The account is on the Pro plan [F1] and the passage agrees [S1].',
  clarifications: [],
  gaps: [],
  conflicts: [],
  review_reasons: [],
};

const provider: Provider = {
  ...stubProvider(),
  embedQuery: async () => ({ vectors: [unit()] }),
  generate: async (_input, deadline) => {
    generateCalls += 1;
    attemptStarts.push(Date.now());
    if (hangUntilDeadline) {
      const wait = Math.max(1, deadline - Date.now());
      await new Promise((r) => setTimeout(r, wait));
      throw new ProviderError('TIMEOUT', 'hung', true);
    }
    if (hang) await hang.promise;
    if (failNext) {
      failNext = false;
      throw new ProviderError('STUB_FAIL', 'stubbed failure', false);
    }
    return { output, model: 'stub:test' };
  },
};

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  const [adaRow] = await db().select().from(employees).where(eq(employees.email, 'ada@omena.example'));
  const [reiRow] = await db().select().from(employees).where(eq(employees.email, 'rei@omena.example'));
  const [account] = await db().select().from(accounts).where(eq(accounts.ref, 'A-1002'));
  accountId = account!.id;

  const created = await queueDocument({
    title: 'Plan comparison',
    category: 'Plans',
    effectiveAt: utcToday(),
    filename: 'plans.md',
    bytes: Buffer.from('# Basic\nSSO is not included.\n', 'utf8'),
    employeeId: adaRow!.id,
  });
  await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, created.version.id));
  await db().update(documents).set({ activeVersionId: created.version.id }).where(eq(documents.id, created.document.id));
  const [chunk] = await db()
    .insert(documentChunks)
    .values({
      versionId: created.version.id,
      chunkIndex: 0,
      heading: 'Basic',
      pageNumber: null,
      text: 'SSO is not included.',
      embedding: unit(),
      embeddingModel: 'gemini-embedding-2',
    })
    .returning();
  documentId = created.document.id;
  passage = {
    chunkId: chunk!.id,
    text: chunk!.text,
    heading: chunk!.heading,
    pageNumber: chunk!.pageNumber,
    versionId: created.version.id,
    versionNumber: 1,
    effectiveAt: utcToday(),
    documentId,
    title: 'Plan comparison',
    category: 'Plans',
    score: 0.9,
    s: 1,
    scriptKey: 'plans:a',
  };

  app = await buildTestApp(undefined, undefined, {
    provider,
    retrieve: async () => [passage],
    requestDeadlineMs: 400,
  });

  const login = async (email: string) => {
    const res = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
    );
    return { cookie: { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }, id: 0 };
  };
  ada = { ...(await login('ada@omena.example')), id: adaRow!.id };
  rei = { ...(await login('rei@omena.example')), id: reiRow!.id };
});

afterAll(async () => {
  await app.close();
});

const ask = (cookie: Record<string, string>, question = 'What plan is this account on?', account = accountId) =>
  app.inject(
    asBrowser({
      method: 'POST',
      url: '/api/conversations',
      cookies: cookie,
      payload: { accountId: account, question },
    }),
  );

const regen = (cookie: Record<string, string>, id: number) =>
  app.inject(asBrowser({ method: 'POST', url: `/api/conversations/${id}/regenerate`, cookies: cookie }));

/** Rows the daily quota counts (REQ §10): first-attempt generate rows. */
const quotaRows = async (employeeId: number) =>
  (
    await db()
      .select()
      .from(providerCalls)
      .where(and(eq(providerCalls.employeeId, employeeId), eq(providerCalls.kind, 'generate'), eq(providerCalls.attempt, 1)))
  ).length;

async function waitForLock() {
  for (let i = 0; i < 50; i++) {
    const rows = await db().select().from(conversations);
    const row = rows.find((r) => r.generationToken);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('lock was never taken');
}

describe.sequential('generation', () => {
  it('returns 409 when a second request arrives while the lock is held', async () => {
    hang = deferred();
    const first = ask(ada.cookie);
    const locked = await waitForLock();
    const second = await regen(ada.cookie, locked.id);
    expect(second.statusCode).toBe(409);
    hang!.resolve(null);
    const done = await first;
    expect(done.statusCode).toBe(201);
    hang = null;
  });

  it('does not let an expired taken-over lock save or clear the new lock', async () => {
    hang = deferred();
    const first = ask(ada.cookie, 'Takeover question');
    const locked = await waitForLock();
    await db()
      .update(conversations)
      .set({ generationStartedAt: new Date(Date.now() - 3 * 60_000) })
      .where(eq(conversations.id, locked.id));

    const secondHang = deferred();
    const original = hang;
    hang = secondHang;
    const second = regen(ada.cookie, locked.id);
    await waitForLock();
    original.resolve(null);
    const stale = await first;
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('LOCK_TAKEN');

    const [after] = await db().select().from(conversations).where(eq(conversations.id, locked.id));
    expect(after!.generationToken).toBeTruthy();

    hang = null;
    secondHang.resolve(null);
    expect((await second).statusCode).toBe(200);
  });

  it('leaves no answer on a stub failure and records the error', async () => {
    failNext = true;
    const before = (await db().select().from(answers)).length;
    const res = await ask(ada.cookie, 'This one fails');
    expect(res.statusCode).toBe(201);
    expect(res.json().state).toBe('failed');
    expect((await db().select().from(answers)).length).toBe(before);
    const [conv] = await db().select().from(conversations).where(eq(conversations.id, res.json().id));
    expect(conv!.generationToken).toBeNull();
    const errors = await db().select().from(providerCalls).where(eq(providerCalls.status, 'error'));
    expect(errors.some((r) => r.errorCode === 'STUB_FAIL' || r.conversationId === res.json().id)).toBe(true);
  });

  it('counts a failed generation once against the quota', async () => {
    const before = await quotaRows(ada.id);
    failNext = true;
    const res = await ask(ada.cookie, 'Fails once');
    expect(res.json().state).toBe('failed');
    expect(await quotaRows(ada.id)).toBe(before + 1);
  });

  it('does not count a failure before any generate call, and logs it without question text', async () => {
    const logs = new LogCapture();
    const isolated = await buildTestApp(logs, undefined, {
      provider,
      retrieve: async () => {
        throw new TypeError('retrieval bug');
      },
    });
    const login = await isolated.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email: 'ada@omena.example', password: PASSWORD } }),
    );
    const cookie = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
    const before = await quotaRows(ada.id);
    const res = await isolated.inject(
      asBrowser({
        method: 'POST',
        url: '/api/conversations',
        cookies: cookie,
        payload: { accountId, question: 'Secret question text' },
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().state).toBe('failed');
    expect(await quotaRows(ada.id)).toBe(before);
    const line = logs.lines.find((l) => l.msg === 'generation failed unexpectedly');
    expect(line).toMatchObject({ err: 'retrieval bug', conversationId: res.json().id });
    expect(logs.text).not.toContain('Secret question text');
    await isolated.close();
  });

  it('still calls the model when retrieval returns no passages', async () => {
    const calls = generateCalls;
    const isolated = await buildTestApp(undefined, undefined, {
      provider,
      retrieve: async () => [],
    });
    const login = await isolated.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email: 'ada@omena.example', password: PASSWORD } }),
    );
    const cookie = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
    const res = await isolated.inject(
      asBrowser({
        method: 'POST',
        url: '/api/conversations',
        cookies: cookie,
        payload: { accountId, question: 'Zero passages' },
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(generateCalls).toBeGreaterThan(calls);
    await isolated.close();
  });

  it('archives a cited document immediately while generate is blocked', async () => {
    hang = deferred();
    const pending = ask(ada.cookie, 'Archive during generate');
    await waitForLock();
    const started = Date.now();
    const archived = await app.inject(
      asBrowser({ method: 'POST', url: `/api/documents/${documentId}/archive`, cookies: ada.cookie }),
    );
    expect(archived.statusCode).toBe(200);
    expect(Date.now() - started).toBeLessThan(500);
    hang!.resolve(null);
    await pending;
    hang = null;
    await app.inject(asBrowser({ method: 'POST', url: `/api/documents/${documentId}/restore`, cookies: ada.cookie }));
  });

  it('starts no generate attempt after the request deadline', async () => {
    hangUntilDeadline = true;
    attemptStarts = [];
    const t0 = Date.now();
    const res = await ask(ada.cookie, 'Deadline hang');
    hangUntilDeadline = false;
    expect(res.statusCode).toBe(201);
    expect(res.json().state).toBe('failed');
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(attemptStarts.every((t) => t < t0 + 400)).toBe(true);
    expect(attemptStarts.length).toBeGreaterThanOrEqual(1);
  });

  it('saves a null chunk_id when the retrieved document is deleted before T2', async () => {
    const isolated = await buildTestApp(undefined, undefined, {
      provider,
      retrieve: async () => [passage],
      afterRetrieve: async () => {
        await db().update(documents).set({ activeVersionId: null }).where(eq(documents.id, documentId));
        await db().delete(documents).where(eq(documents.id, documentId));
      },
    });
    const login = await isolated.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email: 'ada@omena.example', password: PASSWORD } }),
    );
    const cookie = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
    const res = await isolated.inject(
      asBrowser({
        method: 'POST',
        url: '/api/conversations',
        cookies: cookie,
        payload: { accountId, question: 'Delete before T2' },
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().flags.sourceUpdated).toBe(true);
    const [source] = await db()
      .select()
      .from(answerSources)
      .where(eq(answerSources.answerId, res.json().answers[0].id));
    expect(source!.chunkId).toBeNull();
    expect(res.json().answers[0].cites['1'].status).toBe('Deleted');
    await isolated.close();
  });

  it('rejects employee B regenerating A\'s conversation and lets B read it', async () => {
    const created = await ask(ada.cookie, 'Ownership check');
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const turnsBefore = (await db().select().from(turns).where(eq(turns.conversationId, id))).length;
    const answersBefore = (await db().select().from(answers).where(eq(answers.conversationId, id))).length;
    const callsBefore = (await db().select().from(providerCalls).where(eq(providerCalls.conversationId, id))).length;

    const denied = await regen(rei.cookie, id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('NOT_OWNER');
    expect((await db().select().from(turns).where(eq(turns.conversationId, id))).length).toBe(turnsBefore);
    expect((await db().select().from(answers).where(eq(answers.conversationId, id))).length).toBe(answersBefore);
    expect((await db().select().from(providerCalls).where(eq(providerCalls.conversationId, id))).length).toBe(callsBefore);

    const read = await app.inject({ method: 'GET', url: `/api/conversations/${id}`, cookies: rei.cookie });
    expect(read.statusCode).toBe(200);
    expect(read.json().ownedByMe).toBe(false);
  });
});
