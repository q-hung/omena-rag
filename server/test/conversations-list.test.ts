import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth.ts';
import { db } from '../src/db/index.ts';
import { accounts, documentChunks, documentVersions, documents, employees } from '../src/db/schema.ts';
import { stubProvider } from '../src/llm/stub.ts';
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

let app: Awaited<ReturnType<typeof buildTestApp>>;
let adaCookie: Record<string, string>;
let reiCookie: Record<string, string>;
const account: Record<string, number> = {};

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  const staff = await db().select().from(employees);
  const ada = staff.find((e) => e.email === 'ada@omena.example')!;
  for (const row of await db().select().from(accounts)) account[row.ref] = row.id;

  const passages: Passage[] = [];
  const specs = [
    { title: 'Plan comparison', category: 'Plans' as const, heading: 'Basic', key: 'plans:a', text: 'Basic does not include SSO.' },
    { title: 'SSO setup guide', category: 'Security' as const, heading: 'Requirements', key: 'sso:a', text: 'SSO is available only on the Enterprise plan.' },
    { title: 'Refund policy', category: 'Policies' as const, heading: 'Processing time', key: 'refund:c', text: 'Approved refunds take 5–10 business days.' },
    { title: 'Billing FAQ', category: 'FAQ' as const, heading: 'How long do refunds take?', key: 'faq:a', text: 'Refunds usually arrive within 3 days.' },
  ];
  for (const spec of specs) {
    const created = await queueDocument({
      title: spec.title,
      category: spec.category,
      effectiveAt: utcToday(),
      filename: `${spec.key}.md`,
      bytes: Buffer.from(`# ${spec.heading}\n${spec.text}\n`, 'utf8'),
      employeeId: ada.id,
    });
    await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, created.version.id));
    await db().update(documents).set({ activeVersionId: created.version.id }).where(eq(documents.id, created.document.id));
    const [chunk] = await db()
      .insert(documentChunks)
      .values({
        versionId: created.version.id,
        chunkIndex: 0,
        heading: spec.heading,
        pageNumber: spec.key.startsWith('sso') ? 1 : null,
        text: spec.text,
        embedding: unit(),
        embeddingModel: 'gemini-embedding-2',
      })
      .returning();
    passages.push({
      chunkId: chunk!.id,
      text: spec.text,
      heading: spec.heading,
      pageNumber: spec.key.startsWith('sso') ? 1 : null,
      versionId: created.version.id,
      versionNumber: 1,
      effectiveAt: utcToday(),
      documentId: created.document.id,
      title: spec.title,
      category: spec.category,
      score: 0.9,
      s: passages.length + 1,
      scriptKey: spec.key,
    });
  }

  app = await buildTestApp(undefined, undefined, {
    provider: stubProvider(),
    retrieve: async () => passages,
  });
  const login = async (email: string) => {
    const res = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
    );
    return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  };
  adaCookie = await login('ada@omena.example');
  reiCookie = await login('rei@omena.example');
});

afterAll(async () => {
  await app.close();
});

const ask = (cookie: Record<string, string>, accountId: number, question: string) =>
  app.inject(
    asBrowser({ method: 'POST', url: '/api/conversations', cookies: cookie, payload: { accountId, question } }),
  );

describe('conversations list', () => {
  it('returns only my conversations on mine=1 and derives ANS-09 topics', async () => {
    const e01 = await ask(adaCookie, account['A-1001']!, "Why can't this account enable SSO?");
    const e06 = await ask(adaCookie, account['A-1003']!, 'How long until an approved refund arrives?');
    const e12 = await ask(adaCookie, account['A-1002']!, 'What plan is this account on and when was it last charged?');
    const e11 = await ask(adaCookie, account['A-1001']!, "Why won't my motorcycle start?");
    expect([e01, e06, e12, e11].map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);

    const adaOn1004 = await ask(adaCookie, account['A-1004']!, 'Why is this account\'s webhook failing?');
    const reiOn1004 = await ask(reiCookie, account['A-1004']!, 'Does SubPilot support usage-based billing?');
    expect(adaOn1004.statusCode).toBe(201);
    expect(reiOn1004.statusCode).toBe(201);

    const mine = await app.inject({
      method: 'GET',
      url: `/api/conversations?accountId=${account['A-1004']}&mine=1`,
      cookies: adaCookie,
    });
    expect(mine.statusCode).toBe(200);
    const ids = mine.json().conversations.map((c: { id: number }) => c.id);
    expect(ids).toContain(adaOn1004.json().id);
    expect(ids).not.toContain(reiOn1004.json().id);

    expect(e01.json().topics).toEqual(['Plans', 'Security']);
    expect(e06.json().topics).toEqual(['Policies', 'FAQ']);
    expect(e12.json().topics).toEqual(['Account data']);
    expect(e11.json().topics).toEqual([]);
    expect(e11.json().answers[0].outcome).toBe('out_of_scope');
  });
});
