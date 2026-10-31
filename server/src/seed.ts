import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SERVER_ROOT } from './lib/paths.ts';
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { SEED_EMPLOYEES, seedAccounts } from '../fixtures/accounts.ts';
import { FEATURES, accountFeatures, accounts, employees, payments, webhookDeliveries, webhookEndpoints } from './db/schema.ts';
import type { Db } from './db/index.ts';
import { addDays, utcToday } from './lib/format.ts';
import { queueDocument } from './services/document-upload.service.ts';

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

const KB_DIR = join(SERVER_ROOT, 'fixtures/kb');

const KB_DOCS = [
  { file: 'plan-comparison.md', title: 'Plan comparison', category: 'Plans', days: -93, note: 'Added webhook endpoint limit.' },
  { file: 'refund-policy-v2.md', title: 'Refund policy', category: 'Policies', days: -215, note: 'Added annual plans and exceptions.' },
  { file: 'billing-faq.md', title: 'Billing FAQ', category: 'FAQ', days: -143, note: 'Added refund timing question.' },
  { file: 'payment-methods-and-regions.md', title: 'Payment methods and regions', category: 'Billing', days: -184, note: 'Added Australia and declined payments.' },
  { file: 'sso-setup-guide.pdf', title: 'SSO setup guide', category: 'Security', days: -93, note: 'First version.' },
  { file: 'webhooks-developer-guide.md', title: 'Webhooks developer guide', category: 'Developer', days: -93, note: 'Added troubleshooting.' },
  { file: 'failed-payment-retries.pdf', title: 'Failed payment retries', category: 'Billing', days: -1, note: 'First version.' },
  { file: 'security-overview.md', title: 'Security overview', category: 'Security', days: -60, note: 'First version.' },
  { file: 'data-retention-and-deletion.md', title: 'Data retention and deletion', category: 'Compliance', days: -60, note: 'First version.' },
  { file: 'access-control.md', title: 'Access control', category: 'Security', days: -60, note: 'First version.' },
  { file: 'business-continuity.txt', title: 'Business continuity', category: 'Company', days: -60, note: 'First version.' },
  { file: 'subprocessors.md', title: 'Subprocessors', category: 'Compliance', days: -60, note: 'First version.' },
] as const;

/** §6.4: queue every seeded version. refund-policy-v3.md is not seeded. */
export async function seedKnowledgeBase(d: string, employeeId: number): Promise<void> {
  for (const spec of KB_DOCS) {
    await queueDocument({
      title: spec.title,
      category: spec.category,
      effectiveAt: addDays(d, spec.days),
      note: spec.note,
      filename: spec.file,
      bytes: await readFile(join(KB_DIR, spec.file)),
      employeeId,
    });
  }
}

export type SeedOptions = { date?: string; password?: string };

export async function seed(db: Db, options: SeedOptions = {}): Promise<{ date: string }> {
  const date = options.date ?? utcToday();
  await resetDatabase(db);
  const staff = await seedEmployees(db, options.password ?? process.env.SEED_EMPLOYEE_PASSWORD ?? 'omena-demo');
  await seedAccountData(db, date);
  await seedKnowledgeBase(date, staff[0]!.id);
  return { date };
}
