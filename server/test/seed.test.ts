import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import {
  accountFeatures,
  accounts,
  documentVersions,
  documents,
  employees,
  payments,
  webhookDeliveries,
  webhookEndpoints,
} from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';

const D = '2026-10-02';

type Snapshot = Record<string, unknown>[];

// Everything except the identity columns, which restart with each reset.
const withoutIds = (rows: Record<string, unknown>[]): Snapshot =>
  rows.map(({ id, accountId, endpointId, createdAt, ...rest }) => rest);

async function dataSnapshot() {
  return {
    accounts: withoutIds(await db().select().from(accounts).orderBy(asc(accounts.ref))),
    features: withoutIds(
      await db().select().from(accountFeatures).orderBy(asc(accountFeatures.feature)),
    ),
    payments: withoutIds(await db().select().from(payments).orderBy(asc(payments.ref))),
    endpoints: withoutIds(await db().select().from(webhookEndpoints).orderBy(asc(webhookEndpoints.ref))),
    deliveries: withoutIds(
      await db().select().from(webhookDeliveries).orderBy(asc(webhookDeliveries.attemptedAt)),
    ),
  };
}

describe('seed', () => {
  beforeAll(async () => {
    await seed(db(), { date: D, password: 'test-password' });
  });

  it('creates the two employees with argon2id hashes', async () => {
    const rows = await db().select().from(employees).orderBy(asc(employees.email));
    expect(rows.map((r) => r.email)).toEqual(['ada@omena.example', 'rei@omena.example']);
    expect(rows[0]!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(rows[0]!.passwordHash).not.toContain('test-password');
  });

  it('creates the five §5.2 accounts', async () => {
    const rows = await db().select().from(accounts).orderBy(asc(accounts.ref));
    expect(rows.map((r) => r.ref)).toEqual(['A-1001', 'A-1002', 'A-1003', 'A-1004', 'A-1005']);
    expect(rows.find((r) => r.ref === 'A-1005')!.status).toBe('past_due');
    expect(rows.find((r) => r.ref === 'A-1003')!.plan).toBe('enterprise');
  });

  it('gives A-1004 WH-1 twelve trailing 401 deliveries (S3)', async () => {
    const [account] = await db().select().from(accounts).where(eq(accounts.ref, 'A-1004'));
    const endpoints = await db()
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, account!.id))
      .orderBy(asc(webhookEndpoints.ref));
    const wh1 = endpoints.find((e) => e.ref === 'WH-1')!;

    const deliveries = await db()
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, wh1.id))
      .orderBy(asc(webhookDeliveries.attemptedAt));

    expect(deliveries).toHaveLength(20);
    const trailing = deliveries.slice(-12);
    expect(trailing.every((d) => d.outcome === 'http_error' && d.httpStatus === 401)).toBe(true);
    expect(deliveries[7]!.outcome).toBe('success');
  });

  it('reports no webhook endpoints for A-1005', async () => {
    const [account] = await db().select().from(accounts).where(eq(accounts.ref, 'A-1005'));
    const endpoints = await db()
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, account!.id));
    expect(endpoints).toHaveLength(0);
  });

  it('queues the §6.4 knowledge base and leaves refund-policy-v3 unseeded', async () => {
    const rows = await db().select().from(documents).orderBy(asc(documents.title));
    expect(rows.map((r) => r.title)).toEqual([
      'Access control',
      'Billing FAQ',
      'Business continuity',
      'Data retention and deletion',
      'Failed payment retries',
      'Payment methods and regions',
      'Plan comparison',
      'Refund policy',
      'Security overview',
      'SSO setup guide',
      'Subprocessors',
      'Webhooks developer guide',
    ]);
    const versions = await db().select().from(documentVersions);
    expect(versions).toHaveLength(12);
    expect(versions.every((v) => v.indexingStatus === 'queued')).toBe(true);
    expect(versions.some((v) => v.originalFilename === 'refund-policy-v3.md')).toBe(false);
  });

  it('is deterministic for a given D (ACC-01)', async () => {
    const first = await dataSnapshot();
    await seed(db(), { date: D, password: 'test-password' });
    const second = await dataSnapshot();
    expect(second).toEqual(first);
  });
});
