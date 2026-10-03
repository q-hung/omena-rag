import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth.ts';
import { db } from '../src/db/index.ts';
import { accounts, answers, documentChunks, documentVersions, documents, employees } from '../src/db/schema.ts';
import { stubProvider } from '../src/llm/stub.ts';
import type { Provider } from '../src/llm/types.ts';
import { utcToday } from '../src/lib/format.ts';
import type { Passage } from '../src/retrieve.ts';
import { seed } from '../src/seed.ts';
import { queueDocument } from '../src/upload.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';
const unit = () => {
  const v = new Array<number>(768).fill(0);
  v[0] = 1;
  return v;
};

const output = {
  outcome: 'answer' as const,
  answer: 'The account is on the Pro plan [F1] and the passage agrees [S1].',
  clarifications: [],
  gaps: [],
  conflicts: [],
  review_reasons: [],
};

let app: Awaited<ReturnType<typeof buildTestApp>>;
let ada: Record<string, string>;
let rei: Record<string, string>;
let accountId: number;
let passage: Passage;

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
    documentId: created.document.id,
    title: 'Plan comparison',
    category: 'Plans',
    score: 0.9,
    s: 1,
    scriptKey: 'plans:a',
  };
  const provider: Provider = {
    ...stubProvider(),
    embedQuery: async () => ({ vectors: [unit()] }),
    generate: async () => ({ output, model: 'stub:test' }),
  };
  app = await buildTestApp(undefined, undefined, { provider, retrieve: async () => [passage] });
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

const ask = () =>
  app.inject(
    asBrowser({
      method: 'POST',
      url: '/api/conversations',
      cookies: ada,
      payload: { accountId, question: 'What plan is this account on?' },
    }),
  );

const edit = (cookie: Record<string, string>, id: number, editedText: string) =>
  app.inject(asBrowser({ method: 'PATCH', url: `/api/answers/${id}`, cookies: cookie, payload: { editedText } }));

describe('edit', () => {
  it('rejects unknown document and fact markers and never changes answer_text', async () => {
    const created = await ask();
    expect(created.statusCode).toBe(201);
    const answer = created.json().answers[0];
    const original = answer.text;
    expect((await edit(ada, answer.id, 'Nope [7].')).statusCode).toBe(400);
    expect((await edit(ada, answer.id, 'Nope [F99].')).json().error.code).toBe('UNKNOWN_CITATION');
    const ok = await edit(ada, answer.id, 'The plan is Pro [F1].');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().answers[0].edited).toBe('The plan is Pro [F1].');
    expect(ok.json().answers[0].text).toBe(original);
    const [row] = await db().select().from(answers).where(eq(answers.id, answer.id));
    expect(row!.answerText).toBe(original);
    expect(row!.editedText).toBe('The plan is Pro [F1].');
  });

  it('rejects editing a saved conversation', async () => {
    const created = await ask();
    const answer = created.json().answers[0];
    const saved = await app.inject(
      asBrowser({
        method: 'POST',
        url: `/api/conversations/${created.json().id}/review`,
        cookies: ada,
        payload: { answerId: answer.id },
      }),
    );
    expect(saved.statusCode).toBe(200);
    const res = await edit(ada, answer.id, 'Changed [F1].');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_SAVED');
  });

  it('rejects employee B and leaves edited_text unchanged', async () => {
    const created = await ask();
    const answer = created.json().answers[0];
    const denied = await edit(rei, answer.id, 'Stolen [F1].');
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('NOT_OWNER');
    const [row] = await db().select().from(answers).where(eq(answers.id, answer.id));
    expect(row!.editedText).toBeNull();
  });
});
