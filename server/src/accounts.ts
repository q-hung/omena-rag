import { asc } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from './app.ts';
import { buildAccountSnapshot, getAccountSignals } from './context.ts';
import { db } from './db/index.ts';
import { accounts } from './db/schema.ts';

export function registerAccounts(app: App): void {
  app.get('/api/accounts', async () => {
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
      accounts: await Promise.all(rows.map(async (account) => ({
        ...account,
        signals: await getAccountSignals(account.id),
      }))),
    };
  });

  app.get(
    '/api/accounts/:id/facts',
    { schema: { params: z.object({ id: z.string() }) } },
    async (request) => {
      const snapshot = await buildAccountSnapshot(request.params.id);
      return {
        ...snapshot,
        facts: snapshot.facts.map(({ record: _record, ...fact }) => fact),
      };
    },
  );
}
