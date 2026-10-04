import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import { accounts, employees, turns } from '../src/db/schema.ts';
import { stubProvider } from '../src/llm/stub.ts';
import type { Provider } from '../src/llm/types.ts';
import { seed } from '../src/seed.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';

let app: Awaited<ReturnType<typeof buildTestApp>>;
let ada: { cookie: Record<string, string>; id: number };
let rei: { cookie: Record<string, string> };
let a1002: number;
let a1003: number;
let lastPrompt = '';

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  const [adaRow] = await db().select().from(employees).where(eq(employees.email, 'ada@omena.example'));
  for (const row of await db().select().from(accounts)) {
    if (row.ref === 'A-1002') a1002 = row.id;
    if (row.ref === 'A-1003') a1003 = row.id;
  }
  const stub = stubProvider();
  const provider: Provider = {
    ...stub,
    generate: async (input, deadline) => {
      lastPrompt = input.prompt;
      return stub.generate(input, deadline);
    },
  };
  app = await buildTestApp(undefined, undefined, { provider });
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

const ask = (cookie: Record<string, string>, accountId: number, question: string) =>
  app.inject(
    asBrowser({ method: 'POST', url: '/api/conversations', cookies: cookie, payload: { accountId, question } }),
  );

const reply = (cookie: Record<string, string>, id: number, body: { selections?: string[]; text?: string }) =>
  app.inject(asBrowser({ method: 'POST', url: `/api/conversations/${id}/replies`, cookies: cookie, payload: body }));

describe('clarification replies', () => {
  it('rejects a reply on an answer_ready conversation', async () => {
    const created = await ask(ada.cookie, a1002, 'What plan is this account on and when was it last charged?');
    expect(created.statusCode).toBe(201);
    expect(created.json().state).toBe('answer_ready');
    const res = await reply(ada.cookie, created.json().id, { text: 'more detail' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_AWAITING_CLARIFICATION');
  });

  it('rejects an empty reply', async () => {
    const created = await ask(ada.cookie, a1003, 'Is this payment eligible for a refund?');
    expect(created.json().state).toBe('awaiting_clarification');
    const res = await reply(ada.cookie, created.json().id, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('EMPTY_REPLY');
    const blank = await reply(ada.cookie, created.json().id, { text: '   ' });
    expect(blank.json().error.code).toBe('EMPTY_REPLY');
    const long = await reply(ada.cookie, created.json().id, { text: 'x'.repeat(1_001) });
    expect(long.statusCode).toBe(400);
    expect(long.json().error.code).toBe('REPLY_TOO_LONG');
  });

  it('rejects a fact that is not an option', async () => {
    const created = await ask(ada.cookie, a1003, 'Is this payment eligible for a refund?');
    const options = created.json().answers[0].clarifications[0].options.map((o: { fact: string }) => o.fact);
    expect(options.sort()).toEqual(['F10', 'F11']);
    const res = await reply(ada.cookie, created.json().id, { selections: ['F12'] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_SELECTION');
  });

  it('stores F10 and includes the selection in the next prompt', async () => {
    lastPrompt = '';
    const created = await ask(ada.cookie, a1003, 'Is this payment eligible for a refund?');
    const id = created.json().id;
    const res = await reply(ada.cookie, id, { selections: ['F10'] });
    expect(res.statusCode).toBe(200);
    const replies = await db().select().from(turns).where(eq(turns.conversationId, id));
    const last = replies[replies.length - 1]!;
    expect(last.kind).toBe('clarification_reply');
    expect(last.selectedFacts).toEqual(['F10']);
    expect(lastPrompt).toContain('Employee selected: F10');
    expect(res.json().answers.at(-1).reviewReasons).toContain('exception_unclear');
  });

  it('rejects employee B and inserts no turn', async () => {
    const created = await ask(ada.cookie, a1003, 'Is this payment eligible for a refund?');
    const id = created.json().id;
    const before = (await db().select().from(turns).where(eq(turns.conversationId, id))).length;
    const denied = await reply(rei.cookie, id, { selections: ['F10'] });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('NOT_OWNER');
    expect((await db().select().from(turns).where(eq(turns.conversationId, id))).length).toBe(before);
  });
});
