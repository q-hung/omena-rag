import { asc } from 'drizzle-orm';
import { buildAccountSnapshot, getAccountSignals } from '../services/account-context.service.ts';
import { db } from '../db/index.ts';
import { accounts } from '../db/schema.ts';

export async function listAccounts() {
  const rows = await db()
    .select({
      id: accounts.id,
      ref: accounts.ref,
      companyName: accounts.companyName,
      plan: accounts.plan,
      status: accounts.status,
    })
    .from(accounts)
    .orderBy(asc(accounts.ref));

  return {
    accounts: await Promise.all(
      rows.map(async (account) => ({
        ...account,
        signals: await getAccountSignals(account.id),
      })),
    ),
  };
}

export async function getAccountFacts(id: string) {
  const snapshot = await buildAccountSnapshot(id);
  return {
    ...snapshot,
    facts: snapshot.facts.map(({ record: _record, ...fact }) => fact),
  };
}
