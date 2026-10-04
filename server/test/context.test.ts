import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildAccountSnapshot,
  getAccountSignals,
  getRecentPayments,
  getWebhookStatus,
} from '../src/services/account-context.service.ts';
import { db } from '../src/db/index.ts';
import { accounts, payments, webhookDeliveries, webhookEndpoints } from '../src/db/schema.ts';
import { seed } from '../src/seed.ts';

const D = '2026-10-02';
const ids: Record<string, number> = {};

const values = async (ref: string) =>
  (await buildAccountSnapshot(ids[ref], D)).facts.map((f) => f.value).join('\n');

beforeAll(async () => {
  await seed(db(), { date: D, password: 'test-password' });
  for (const a of await db().select().from(accounts)) {
    ids[a.ref] = a.id;
  }
});

describe('account context', () => {
  it('counts whole UTC days across midnight', async () => {
    const accountId = ids['A-1002']!;
    const [late] = await db()
      .insert(payments)
      .values([
        { accountId, ref: 'PAY-T1', occurredAt: new Date('2026-10-01T23:59:00Z'), amountMinor: 100, currency: 'EUR', status: 'succeeded', description: 't' },
        { accountId, ref: 'PAY-T2', occurredAt: new Date('2026-10-02T00:01:00Z'), amountMinor: 100, currency: 'EUR', status: 'succeeded', description: 't' },
      ])
      .returning();
    const { payments: rows } = await getRecentPayments(accountId, 2, D);
    expect(rows.map((p) => [p.ref, p.daysSince])).toEqual([['PAY-T2', 0], ['PAY-T1', 1]]);
    await db().delete(payments).where(sql`${payments.ref} like 'PAY-T%'`);
    expect(late).toBeDefined();
  });

  it('computes the A-1004 WH-1 failure streak', async () => {
    const [wh1, wh2] = await getWebhookStatus(ids['A-1004'], D);
    expect(wh1!.ref).toBe('WH-1');
    expect(wh1!.consecutiveFailures).toBe(12);
    expect(wh1!.recentDeliveries).toHaveLength(5);
    expect(wh2!.consecutiveFailures).toBe(0);
  });

  it('formats EUR, GBP and USD amounts from minor units', async () => {
    expect(await values('A-1001')).toContain('EUR 29.00');
    expect(await values('A-1003')).toContain('GBP 4,800.00');
    expect(await values('A-1004')).toContain('USD 99.00');
  });

  it('builds F ids in a fixed order with private record refs', async () => {
    const snapshot = await buildAccountSnapshot(ids['A-1004'], D);
    expect(snapshot.as_of).toBe(D);
    expect(snapshot.facts.map((f) => f.id)).toEqual(snapshot.facts.map((_, i) => `F${i + 1}`));
    expect([...new Set(snapshot.facts.map((f) => f.section))]).toEqual(['account', 'features', 'payments', 'webhooks']);
    expect(snapshot.facts[0]).toMatchObject({ label: 'Plan', value: 'Pro', record: { table: 'accounts', id: ids['A-1004'] } });
    const status = snapshot.facts.find((f) => f.key === 'wh:WH-1:status')!;
    expect(status.value).toMatch(/^12 consecutive failures \(HTTP 401\)/);
    expect(snapshot.empty).toEqual([]);
  });

  it('reports an empty webhook section for A-1005', async () => {
    const snapshot = await buildAccountSnapshot(ids['A-1005'], D);
    expect(snapshot.empty).toEqual([{ section: 'webhooks', note: 'No webhook endpoints configured (0 rows)' }]);
    expect(snapshot.facts.some((f) => f.section === 'webhooks')).toBe(false);
  });

  it('rejects an unknown or invalid account id', async () => {
    await expect(buildAccountSnapshot(999_999, D)).rejects.toMatchObject({ statusCode: 404 });
    await expect(buildAccountSnapshot('abc', D)).rejects.toMatchObject({ statusCode: 400 });
    await expect(getRecentPayments(ids['A-1001'], 21, D)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('raises account_data_unavailable when the payments query fails', async () => {
    await db().execute(sql`alter table payments rename to payments_broken`);
    try {
      await expect(buildAccountSnapshot(ids['A-1001'], D)).rejects.toMatchObject({
        statusCode: 503,
        code: 'account_data_unavailable',
      });
    } finally {
      await db().execute(sql`alter table payments_broken rename to payments`);
    }
  });
});

describe('account signals', () => {
  const labels = async (ref: string) => (await getAccountSignals(ids[ref])).map((s) => s.label);

  it('follows the §5.5 table for the seed accounts', async () => {
    expect(await labels('A-1004')).toEqual(['Webhook failing']);
    expect(await labels('A-1005')).toEqual(['Payment failed', 'Past due']);
    expect(await labels('A-1003')).toEqual(['Enterprise']);
    expect(await labels('A-1001')).toEqual([]);
    expect(await labels('A-1002')).toEqual([]);
  });

  it('does not flag an endpoint with only 2 consecutive failures', async () => {
    const [endpoint] = await db()
      .insert(webhookEndpoints)
      .values({ accountId: ids['A-1002']!, ref: 'WH-T', url: 'https://t.example/h', enabled: true, events: ['invoice.paid'] })
      .returning();
    const at = (h: number) => new Date(Date.parse(`${D}T00:00:00Z`) + h * 3_600_000);
    await db().insert(webhookDeliveries).values([
      { endpointId: endpoint!.id, attemptedAt: at(1), eventType: 'invoice.paid', outcome: 'success', httpStatus: 200 },
      { endpointId: endpoint!.id, attemptedAt: at(2), eventType: 'invoice.paid', outcome: 'http_error', httpStatus: 500 },
      { endpointId: endpoint!.id, attemptedAt: at(3), eventType: 'invoice.paid', outcome: 'timeout' },
    ]);
    try {
      expect(await labels('A-1002')).toEqual([]);
      await db().insert(webhookDeliveries).values({
        endpointId: endpoint!.id, attemptedAt: at(4), eventType: 'invoice.paid', outcome: 'timeout',
      });
      expect(await labels('A-1002')).toEqual(['Webhook failing']);
    } finally {
      await db().delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint!.id));
    }
  });
});
