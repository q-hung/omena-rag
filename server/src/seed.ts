import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { SEED_EMPLOYEES, seedAccounts } from '../fixtures/accounts.ts';
import { FEATURES, accountFeatures, accounts, employees, payments, webhookDeliveries, webhookEndpoints } from './db/schema.ts';
import type { Db } from './db/index.ts';
import { utcToday } from './lib/format.ts';

export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`
    do $$
    declare t text;
    begin
      for t in select tablename from pg_tables where schemaname = 'public'
      loop execute format('truncate table %I restart identity cascade', t); end loop;
    end $$;
  `);
}

export async function seedEmployees(db: Db, password: string) {
  const passwordHash = await hash(password, { algorithm: 2 }); // 2 = argon2id
  return db
    .insert(employees)
    .values(SEED_EMPLOYEES.map((e) => ({ ...e, passwordHash })))
    .returning();
}

/** ACC-01: the §5.2 dataset, identical for a given D. */
export async function seedAccountData(db: Db, d: string): Promise<void> {
  for (const spec of seedAccounts(d)) {
    const [account] = await db
      .insert(accounts)
      .values({
        ref: spec.ref,
        companyName: spec.companyName,
        plan: spec.plan,
        status: spec.status,
        billingInterval: spec.billingInterval,
        region: spec.region,
        customerSince: spec.customerSince,
      })
      .returning();

    await db.insert(accountFeatures).values(
      FEATURES.map((feature) => ({
        accountId: account!.id,
        feature,
        enabled: spec.features.includes(feature),
      })),
    );

    if (spec.payments.length) {
      await db.insert(payments).values(
        spec.payments.map((p) => ({
          accountId: account!.id,
          ref: p.ref,
          occurredAt: new Date(p.occurredAt),
          amountMinor: p.amountMinor,
          currency: p.currency,
          status: p.status,
          description: p.description,
          failureCode: p.failureCode ?? null,
        })),
      );
    }

    for (const spec_ of spec.endpoints) {
      const [endpoint] = await db
        .insert(webhookEndpoints)
        .values({
          accountId: account!.id,
          ref: spec_.ref,
          url: spec_.url,
          enabled: spec_.enabled,
          events: spec_.events,
        })
        .returning();
      await db.insert(webhookDeliveries).values(
        spec_.deliveries.map((d_) => ({
          endpointId: endpoint!.id,
          attemptedAt: new Date(d_.attemptedAt),
          eventType: d_.eventType,
          outcome: d_.outcome,
          httpStatus: d_.httpStatus,
          responseMs: d_.outcome === 'success' ? 120 : 240,
        })),
      );
    }
  }
}

export type SeedOptions = { date?: string; password?: string };

export async function seed(db: Db, options: SeedOptions = {}): Promise<{ date: string }> {
  const date = options.date ?? utcToday();
  await resetDatabase(db);
  await seedEmployees(db, options.password ?? process.env.SEED_EMPLOYEE_PASSWORD ?? 'jarvis-demo');
  await seedAccountData(db, date);
  return { date };
}
