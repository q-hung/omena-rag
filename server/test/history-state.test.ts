import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth.ts';
import { db } from '../src/db/index.ts';
import { accounts, answers, conversations, employees, reviewedAnswers, turns } from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';
import { HISTORY_LIMIT } from '../src/conversations.ts';
import { conversationStatesById, deriveState, type ConversationState } from '../src/state.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';
const CASES: ConversationState[] = [
  'generating',
  'saved',
  'failed',
  'awaiting_clarification',
  'out_of_scope',
  'needs_review',
  'insufficient_evidence',
  'answer_ready',
];

let app: Awaited<ReturnType<typeof buildTestApp>>;
let ada: Record<string, string>;
let rei: Record<string, string>;
let accountId: number;
let a1004: number;
let employeeId: number;

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  const [adaRow] = await db().select().from(employees).where(eq(employees.email, 'ada@omena.example'));
  employeeId = adaRow!.id;
  const [account] = await db().select().from(accounts).where(eq(accounts.ref, 'A-1002'));
  const [northwind] = await db().select().from(accounts).where(eq(accounts.ref, 'A-1004'));
  accountId = account!.id;
  a1004 = northwind!.id;
  app = await buildTestApp();
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

async function fixture(state: ConversationState) {
  const [conv] = await db().insert(conversations).values({ accountId, createdBy: employeeId }).returning();
  const [turn] = await db()
    .insert(turns)
    .values({ conversationId: conv!.id, seq: 1, kind: 'question', text: state, createdBy: employeeId })
    .returning();
  if (state === 'generating') {
    await db()
      .update(conversations)
      .set({ generationToken: '00000000-0000-0000-0000-000000000001', generationStartedAt: new Date() })
      .where(eq(conversations.id, conv!.id));
    return conv!.id;
  }
  if (state === 'failed') return conv!.id;
  const outcome =
    state === 'awaiting_clarification'
      ? 'clarification_required'
      : state === 'out_of_scope'
        ? 'out_of_scope'
        : state === 'insufficient_evidence'
          ? 'insufficient_evidence'
          : 'answer';
  const reviewReasons = state === 'needs_review' || (state === 'saved' && false) ? ['exception_unclear'] : [];
  const [answer] = await db()
    .insert(answers)
    .values({
      conversationId: conv!.id,
      turnId: turn!.id,
      createdBy: employeeId,
      outcome,
      answerText: state === 'awaiting_clarification' ? '' : 'Saved text [F1].',
      reviewReasons,
      factsSnapshot: { as_of: '2026-10-02', facts: [], empty: [] },
      asOf: '2026-10-02',
      model: 'stub:test',
      promptVersion: 'v1',
    })
    .returning();
  if (state === 'saved') {
    await db().insert(reviewedAnswers).values({
      conversationId: conv!.id,
      answerId: answer!.id,
      finalText: 'Saved text [F1].',
      sources: [],
      facts: [],
      reviewAcknowledged: false,
      reviewerId: employeeId,
    });
  }
  return conv!.id;
}

describe('history state', () => {
  it('matches the TypeScript derivation for every WF-05 state', async () => {
    const ids = [];
    for (const state of CASES) ids.push(await fixture(state));
    const sqlStates = await conversationStatesById(ids);
    for (let i = 0; i < CASES.length; i++) {
      const id = ids[i]!;
      const expected = CASES[i]!;
      const [conv] = await db().select().from(conversations).where(eq(conversations.id, id));
      const [turn] = await db().select().from(turns).where(eq(turns.conversationId, id));
      const [answer] = await db().select().from(answers).where(eq(answers.conversationId, id));
      const [reviewed] = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.conversationId, id));
      const ts = deriveState({
        generating: !!(conv!.generationToken && conv!.generationStartedAt),
        saved: !!reviewed,
        hasAnswer: !!answer && answer.turnId === turn?.id,
        outcome: answer?.outcome,
        reviewReasons: (answer?.reviewReasons as string[]) ?? [],
      });
      expect(ts).toBe(expected);
      expect(sqlStates.get(id)).toBe(expected);
    }
  });

  it('filters History by mine and signal', async () => {
    const [adaConv] = await db().insert(conversations).values({ accountId: a1004, createdBy: employeeId }).returning();
    await db().insert(turns).values({
      conversationId: adaConv!.id,
      seq: 1,
      kind: 'question',
      text: 'webhook',
      createdBy: employeeId,
    });
    const all = await app.inject({ method: 'GET', url: '/api/conversations?mine=0', cookies: ada });
    expect(all.statusCode).toBe(200);
    const mine = await app.inject({ method: 'GET', url: `/api/conversations?accountId=${a1004}&mine=1`, cookies: ada });
    const other = await app.inject({ method: 'GET', url: `/api/conversations?accountId=${a1004}&mine=1`, cookies: rei });
    expect(mine.json().conversations.some((c: { id: number }) => c.id === adaConv!.id)).toBe(true);
    expect(other.json().conversations.some((c: { id: number }) => c.id === adaConv!.id)).toBe(false);
    const failing = await app.inject({
      method: 'GET',
      url: `/api/conversations?mine=0&signal=webhook_failing`,
      cookies: ada,
    });
    expect(failing.json().conversations.every((c: { accountRef: string }) => c.accountRef === 'A-1004')).toBe(true);
  });

  it('filters by state in SQL', async () => {
    const ids = new Map<ConversationState, number>();
    for (const state of CASES) ids.set(state, await fixture(state));
    for (const state of CASES) {
      const res = await app.inject({ method: 'GET', url: `/api/conversations?mine=0&state=${state}`, cookies: ada });
      const rows = res.json().conversations as { id: number; state: string }[];
      expect(rows.map((r) => r.id)).toContain(ids.get(state));
      expect(rows.every((r) => r.state === state)).toBe(true);
    }
  });

  it(`returns at most ${HISTORY_LIMIT} rows, newest first`, async () => {
    await db()
      .insert(conversations)
      .values(Array.from({ length: HISTORY_LIMIT + 1 }, () => ({ accountId: a1004, createdBy: employeeId })));
    const res = await app.inject({ method: 'GET', url: '/api/conversations?mine=0', cookies: ada });
    const rows = res.json().conversations as { createdAt: string }[];
    expect(rows).toHaveLength(HISTORY_LIMIT);
    const times = rows.map((r) => r.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });
});
