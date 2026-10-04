import { inArray, sql } from 'drizzle-orm';
import { getAccountSignals } from '../services/account-context.service.ts';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import { conversations } from '../db/schema.ts';
import { STATE_FROM, STATE_SQL } from '../services/state.service.ts';
import { presentSummaries } from './conversation-view.service.ts';

export const HISTORY_LIMIT = 200;

export async function listConversations(input: {
  employeeId: number;
  accountId?: number;
  mine: '0' | '1';
  state?: string;
  signal?: string;
  topic?: string;
}) {
  const { accountId, mine, state, signal, topic, employeeId } = input;
  const filters = [];
  if (accountId) filters.push(sql`c.account_id = ${accountId}`);
  if (mine === '1') filters.push(sql`c.created_by = ${employeeId}`);
  if (signal) {
    const withSignal = await accountsWithSignal(signal, filters);
    if (!withSignal.length) return { conversations: [] };
    filters.push(sql`c.account_id in (${sql.join(withSignal.map((id) => sql`${id}`), sql`, `)})`);
  }
  if (state) filters.push(sql`${STATE_SQL} = ${state}`);
  const where = filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
  // ponytail: topics are derived from cited sources in TS, so a topic filter runs over every
  // matching row before the limit. Move topicsOf into SQL if topic-filtered History gets slow.
  const limit = topic ? sql`` : sql`limit ${HISTORY_LIMIT}`;
  const ids = rowsOf(
    await db().execute(sql`select c.id from ${STATE_FROM} ${where} order by c.created_at desc, c.id desc ${limit}`),
  ).map((r) => Number(r.id));
  if (!ids.length) return { conversations: [] };

  const byId = new Map(
    (await db().select().from(conversations).where(inArray(conversations.id, ids))).map((r) => [r.id, r]),
  );
  const listed = await presentSummaries(ids.map((id) => byId.get(id)!), employeeId);
  return {
    conversations: topic ? listed.filter((row) => row.topics.includes(topic)).slice(0, HISTORY_LIMIT) : listed,
  };
}

export async function accountsWithSignal(signal: string, filters: ReturnType<typeof sql>[]): Promise<number[]> {
  const where = filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
  const accountIds = rowsOf(await db().execute(sql`select distinct c.account_id from conversations c ${where}`)).map(
    (r) => Number(r.account_id),
  );
  const matches = await Promise.all(
    accountIds.map(async (id) => ((await getAccountSignals(id)).some((s) => s.key === signal || s.label === signal) ? id : null)),
  );
  return matches.filter((id): id is number => id != null);
}
