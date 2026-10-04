import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import {
  accounts,
  conversations,
  documentChunks,
  documentVersions,
  documents,
  employees,
  reviewedAnswers,
} from '../src/db/schema.ts';
import { stubProvider } from '../src/llm/stub.ts';
import type { Provider } from '../src/llm/types.ts';
import { utcToday } from '../src/lib/format.ts';
import type { Passage } from '../src/retrieve.ts';
import { seed } from '../src/seed.ts';
import { queueDocument, queueVersion } from '../src/services/document-upload.service.ts';
import { activateVersion } from '../src/worker.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';
const unit = () => {
  const v = new Array<number>(768).fill(0);
  v[0] = 1;
  return v;
};

let output: {
  outcome: 'answer' | 'clarification_required' | 'insufficient_evidence' | 'out_of_scope';
  answer: string;
  clarifications: { kind: 'choose_record'; prompt: string; options: string[] }[];
  gaps: { kind: 'user_input'; detail: string }[];
  conflicts: { topic: string; sources: string[] }[];
  review_reasons: ('policy_applicability' | 'exception_unclear')[];
} = {
  outcome: 'answer',
  answer: 'The account is on the Pro plan [F1] and the passage agrees [S1].',
  clarifications: [],
  gaps: [],
  conflicts: [],
  review_reasons: [],
};

let hang: { promise: Promise<unknown>; resolve: (v: unknown) => void } | null = null;
let afterT2Lock: (() => Promise<void>) | undefined;
let ada: { cookie: Record<string, string>; id: number };
let rei: Record<string, string>;
let accountId: number;
let documentId: number;
let passage: Passage;
let app: Awaited<ReturnType<typeof buildTestApp>>;

function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  const [adaRow] = await db().select().from(employees).where(eq(employees.email, 'ada@omena.example'));
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
  documentId = created.document.id;
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
  passage = {
    chunkId: chunk!.id,
    text: chunk!.text,
    heading: chunk!.heading,
    pageNumber: null,
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
  const provider: Provider = {
    ...stubProvider(),
    embedQuery: async () => ({ vectors: [unit()] }),
    generate: async () => {
      if (hang) await hang.promise;
      return { output, model: 'stub:test' };
    },
  };
  app = await buildTestApp(undefined, undefined, {
    provider,
    retrieve: async () => [passage],
    afterT2Lock: async () => afterT2Lock?.(),
  });
  const login = async (email: string) => {
    const res = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
    );
    return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  };
  ada = { cookie: await login('ada@omena.example'), id: adaRow!.id };
  rei = await login('rei@omena.example');
});

afterAll(async () => {
  await app.close();
});

const ask = (question = 'What plan is this account on?') =>
  app.inject(
    asBrowser({ method: 'POST', url: '/api/conversations', cookies: ada.cookie, payload: { accountId, question } }),
  );

const review = (cookie: Record<string, string>, conversationId: number, answerId: number, ack?: boolean) =>
  app.inject(
    asBrowser({
      method: 'POST',
      url: `/api/conversations/${conversationId}/review`,
      cookies: cookie,
      payload: { answerId, reviewAcknowledged: ack },
    }),
  );

describe.sequential('review', () => {
  it('returns 409 for each blocked save case', async () => {
    const created = await ask('Generating block');
    const id = created.json().id;
    const a1 = created.json().answers[0].id;

    hang = deferred();
    const regen = app.inject(
      asBrowser({ method: 'POST', url: `/api/conversations/${id}/regenerate`, cookies: ada.cookie }),
    );
    for (let i = 0; i < 50; i++) {
      const [row] = await db().select().from(conversations).where(eq(conversations.id, id));
      if (row?.generationToken) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const generating = await review(ada.cookie, id, a1);
    expect(generating.statusCode).toBe(409);
    expect(generating.json().error.code).toBe('GENERATION_IN_PROGRESS');
    hang.resolve(null);
    const done = await regen;
    hang = null;
    expect(done.statusCode).toBe(200);
    const a2 = done.json().answers[0].id;
    const notLatest = await review(ada.cookie, id, a1);
    expect(notLatest.json().error.code).toBe('NOT_LATEST');

    const saved = await review(ada.cookie, id, a2);
    expect(saved.statusCode).toBe(200);
    expect((await review(ada.cookie, id, a2)).json().error.code).toBe('ALREADY_SAVED');

    output = { ...output, outcome: 'clarification_required', clarifications: [{ kind: 'choose_record', prompt: 'Which?', options: ['F1', 'F2'] }] };
    const clarify = await ask('Clarify');
    output = { ...output, outcome: 'answer', clarifications: [] };
    expect((await review(ada.cookie, clarify.json().id, clarify.json().answers[0].id)).json().error.code).toBe(
      'CLARIFICATION_REQUIRED',
    );

    output = { ...output, outcome: 'out_of_scope' };
    const oos = await ask('Out of scope');
    output = { ...output, outcome: 'answer' };
    expect((await review(ada.cookie, oos.json().id, oos.json().answers[0].id)).json().error.code).toBe('OUT_OF_SCOPE');

    const emptyConv = await ask('Empty later');
    await app.inject(
      asBrowser({
        method: 'PATCH',
        url: `/api/answers/${emptyConv.json().answers[0].id}`,
        cookies: ada.cookie,
        payload: { editedText: '   ' },
      }),
    );
    expect((await review(ada.cookie, emptyConv.json().id, emptyConv.json().answers[0].id)).json().error.code).toBe(
      'EMPTY_TEXT',
    );

    const staleConv = await ask('Then archive');
    await app.inject(
      asBrowser({ method: 'POST', url: `/api/documents/${documentId}/archive`, cookies: ada.cookie }),
    );
    expect((await review(ada.cookie, staleConv.json().id, staleConv.json().answers[0].id)).json().error.code).toBe(
      'SOURCE_STALE',
    );
    await app.inject(asBrowser({ method: 'POST', url: `/api/documents/${documentId}/restore`, cookies: ada.cookie }));

    output = { ...output, review_reasons: ['exception_unclear'] };
    const flagged = await ask('Needs ack');
    output = { ...output, review_reasons: [] };
    expect((await review(ada.cookie, flagged.json().id, flagged.json().answers[0].id)).json().error.code).toBe(
      'REVIEW_REQUIRED',
    );
    expect((await review(ada.cookie, flagged.json().id, flagged.json().answers[0].id, true)).statusCode).toBe(200);
  });

  it('rejects employee B before any 409 and inserts no reviewed row', async () => {
    const created = await ask('Ownership');
    const before = (await db().select().from(reviewedAnswers)).length;
    const denied = await review(rei, created.json().id, created.json().answers[0].id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('NOT_OWNER');
    expect((await db().select().from(reviewedAnswers)).length).toBe(before);
  });

  it('lets only one of two concurrent saves succeed', async () => {
    const created = await ask('Concurrent save');
    const id = created.json().id;
    const answerId = created.json().answers[0].id;
    const [a, b] = await Promise.all([review(ada.cookie, id, answerId), review(ada.cookie, id, answerId)]);
    const codes = [a, b].map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409]);
    const rows = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
    expect(rows).toHaveLength(1);
  });

  it('never commits a stale save when racing activation', async () => {
    const created = await ask('Race activate');
    const id = created.json().id;
    const answerId = created.json().answers[0].id;
    const queued = await queueVersion(documentId, {
      effectiveAt: utcToday(),
      filename: 'plans-v2.md',
      bytes: Buffer.from('# Basic\nSSO is still not included on Basic.\n', 'utf8'),
      employeeId: ada.id,
    });
    const [saveRes] = await Promise.all([
      review(ada.cookie, id, answerId),
      activateVersion(
        queued.version.id,
        [{ heading: 'Basic', pageNumber: null, text: 'SSO is still not included on Basic.', embedding: unit() }],
        { warnings: [], pageCount: 1, model: 'gemini-embedding-2' },
      ),
    ]);
    if (saveRes.statusCode === 200) {
      const [row] = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
      const sources = row!.sources as { version_id: number }[];
      expect(sources[0]?.version_id).toBe(passage.versionId);
    } else {
      expect(saveRes.json().error.code).toBe('SOURCE_STALE');
      const rows = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
      expect(rows).toHaveLength(0);
    }
    const [chunk] = await db().select().from(documentChunks).where(eq(documentChunks.versionId, queued.version.id));
    passage = {
      ...passage,
      chunkId: chunk!.id,
      versionId: queued.version.id,
      versionNumber: queued.version.versionNumber,
    };
  });

  it('serialises a save and an edit', async () => {
    const created = await ask('Race edit');
    const id = created.json().id;
    const answerId = created.json().answers[0].id;
    const [saveRes, editRes] = await Promise.all([
      review(ada.cookie, id, answerId),
      app.inject(
        asBrowser({
          method: 'PATCH',
          url: `/api/answers/${answerId}`,
          cookies: ada.cookie,
          payload: { editedText: 'Edited plan [F1] and passage [1].' },
        }),
      ),
    ]);
    if (saveRes.statusCode === 200) {
      const [row] = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
      if (editRes.statusCode === 200) {
        expect(row!.finalText).toBe('Edited plan [F1] and passage [1].');
      } else {
        expect(editRes.json().error.code).toBe('ALREADY_SAVED');
      }
    } else {
      expect(editRes.statusCode).toBe(200);
      expect(saveRes.json().error.code).toBe('ALREADY_SAVED');
    }
  });

  it('returns NOT_LATEST when a save races T2', async () => {
    const created = await ask('Race T2');
    const id = created.json().id;
    const a1 = created.json().answers[0].id;
    let saveP!: ReturnType<typeof review>;
    afterT2Lock = async () => {
      saveP = review(ada.cookie, id, a1);
    };
    const regen = await app.inject(
      asBrowser({ method: 'POST', url: `/api/conversations/${id}/regenerate`, cookies: ada.cookie }),
    );
    afterT2Lock = undefined;
    const saveRes = await saveP;
    expect(regen.statusCode).toBe(200);
    expect(saveRes.statusCode).toBe(409);
    expect(saveRes.json().error.code).toBe('NOT_LATEST');
  });

  it('keeps the snapshot after delete and flags source changed; restore clears archive', async () => {
    const created = await ask('Snapshot');
    const id = created.json().id;
    const answerId = created.json().answers[0].id;
    expect((await review(ada.cookie, id, answerId)).statusCode).toBe(200);
    await app.inject(asBrowser({ method: 'DELETE', url: `/api/documents/${documentId}`, cookies: ada.cookie }));
    const afterDelete = await app.inject({ method: 'GET', url: `/api/conversations/${id}`, cookies: ada.cookie });
    expect(afterDelete.json().flags.sourceChanged).toBe(true);
    expect(afterDelete.json().reviewed.text).toContain('Pro plan');
    const [row] = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
    expect((row!.sources as { title: string }[])[0]?.title).toBe('Plan comparison');

    const replacement = await queueDocument({
      title: 'Plan comparison',
      category: 'Plans',
      effectiveAt: utcToday(),
      filename: 'plans.md',
      bytes: Buffer.from('# Basic\nSSO is not included.\n', 'utf8'),
      employeeId: ada.id,
    });
    await db()
      .update(documentVersions)
      .set({ indexingStatus: 'ready' })
      .where(eq(documentVersions.id, replacement.version.id));
    await db()
      .update(documents)
      .set({ activeVersionId: replacement.version.id })
      .where(eq(documents.id, replacement.document.id));
    const [chunk] = await db()
      .insert(documentChunks)
      .values({
        versionId: replacement.version.id,
        chunkIndex: 0,
        heading: 'Basic',
        pageNumber: null,
        text: 'SSO is not included.',
        embedding: unit(),
        embeddingModel: 'gemini-embedding-2',
      })
      .returning();
    documentId = replacement.document.id;
    passage = { ...passage, chunkId: chunk!.id, versionId: replacement.version.id, documentId };

    const archived = await ask('Archive flag');
    expect((await review(ada.cookie, archived.json().id, archived.json().answers[0].id)).statusCode).toBe(200);
    await app.inject(asBrowser({ method: 'POST', url: `/api/documents/${documentId}/archive`, cookies: ada.cookie }));
    const flagged = await app.inject({
      method: 'GET',
      url: `/api/conversations/${archived.json().id}`,
      cookies: ada.cookie,
    });
    expect(flagged.json().flags.sourceChanged).toBe(true);
    await app.inject(asBrowser({ method: 'POST', url: `/api/documents/${documentId}/restore`, cookies: ada.cookie }));
    const restored = await app.inject({
      method: 'GET',
      url: `/api/conversations/${archived.json().id}`,
      cookies: ada.cookie,
    });
    expect(restored.json().flags.sourceChanged).toBe(false);
  });
});
