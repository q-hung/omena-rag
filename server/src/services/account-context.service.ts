import { and, asc, count, desc, eq, gt, gte, max } from 'drizzle-orm';
import { z } from 'zod';
import { db, type Db } from '../db/index.ts';
import { FEATURES, accountFeatures, accounts, payments, webhookDeliveries, webhookEndpoints } from '../db/schema.ts';
import { AppError, badRequest, notFound } from '../errors.ts';
import { addDays, daysBetween, fmtDate, fmtDateTime, fmtMoney, isoDate, utcToday } from '../lib/format.ts';

// Account context (REQ §5.3–§5.5, CTX-01–05, SIG-01). Read-only; every derived
// value is computed here so the model only ever receives finished facts.

export const accountIdSchema = z.coerce.number().int().positive();

const MAX_ENDPOINTS = 5;
const RECENT_DELIVERIES = 5;
const WEBHOOK_FAILING_STREAK = 3;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function parseAccountId(accountId: unknown): number {
  const parsed = accountIdSchema.safeParse(accountId);
  if (!parsed.success) {
    throw badRequest('VALIDATION_FAILED', 'The account id is invalid.');
  }
  return parsed.data;
}

/** CTX-05: any database failure is surfaced, never mistaken for an empty result. */
async function readOnly<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db().transaction(fn, { accessMode: 'read only' });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(503, 'account_data_unavailable', 'Account data could not be loaded. Try again.', {
      cause: error,
    });
  }
}

export async function getAccountDetails(accountId: unknown) {
  const id = parseAccountId(accountId);
  return readOnly(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, id));
    if (!account) {
      throw notFound('ACCOUNT_NOT_FOUND', 'No such account.');
    }
    const features = await tx
      .select({ feature: accountFeatures.feature, enabled: accountFeatures.enabled })
      .from(accountFeatures)
      .where(eq(accountFeatures.accountId, id));
    const enabled = new Set(features.filter((f) => f.enabled).map((f) => f.feature));
    return { ...account, features: FEATURES.map((feature) => ({ feature, enabled: enabled.has(feature) })) };
  });
}

export async function getRecentPayments(accountId: unknown, limit = 10, asOf = utcToday()) {
  const id = parseAccountId(accountId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw badRequest('VALIDATION_FAILED', 'The payment limit must be 1–20.');
  }
  return readOnly(async (tx) => {
    const rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.accountId, id))
      .orderBy(desc(payments.occurredAt), desc(payments.id))
      .limit(limit);
    const [first] = await tx
      .select({ id: payments.id, occurredAt: payments.occurredAt })
      .from(payments)
      .where(and(eq(payments.accountId, id), eq(payments.status, 'succeeded')))
      .orderBy(asc(payments.occurredAt))
      .limit(1);
    return {
      payments: rows.map((p) => ({
        ...p,
        daysSince: daysBetween(isoDate(p.occurredAt), asOf),
        amount: fmtMoney(p.amountMinor, p.currency),
      })),
      firstSucceeded: first ?? null,
    };
  });
}

export async function getWebhookStatus(accountId: unknown, asOf = utcToday()) {
  const id = parseAccountId(accountId);
  const weekStart = new Date(`${addDays(asOf, -7)}T00:00:00Z`);
  return readOnly(async (tx) => {
    const endpoints = await tx
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, id))
      .orderBy(asc(webhookEndpoints.ref))
      .limit(MAX_ENDPOINTS);

    const result = [];
    for (const endpoint of endpoints) {
      const ofEndpoint = eq(webhookDeliveries.endpointId, endpoint.id);
      const [{ lastSuccessAt }] = (await tx
        .select({ lastSuccessAt: max(webhookDeliveries.attemptedAt) })
        .from(webhookDeliveries)
        .where(and(ofEndpoint, eq(webhookDeliveries.outcome, 'success')))) as [{ lastSuccessAt: Date | null }];
      const [{ failures }] = (await tx
        .select({ failures: count() })
        .from(webhookDeliveries)
        .where(lastSuccessAt ? and(ofEndpoint, gt(webhookDeliveries.attemptedAt, lastSuccessAt)) : ofEndpoint)) as [
        { failures: number },
      ];
      const week = await tx
        .select({ outcome: webhookDeliveries.outcome, n: count() })
        .from(webhookDeliveries)
        .where(and(ofEndpoint, gte(webhookDeliveries.attemptedAt, weekStart)))
        .groupBy(webhookDeliveries.outcome);
      const recent = await tx
        .select({
          attemptedAt: webhookDeliveries.attemptedAt,
          eventType: webhookDeliveries.eventType,
          outcome: webhookDeliveries.outcome,
          httpStatus: webhookDeliveries.httpStatus,
        })
        .from(webhookDeliveries)
        .where(ofEndpoint)
        .orderBy(desc(webhookDeliveries.attemptedAt))
        .limit(RECENT_DELIVERIES);

      result.push({
        ...endpoint,
        scheme: endpoint.url.split(':')[0]!.toUpperCase(),
        consecutiveFailures: failures,
        lastSuccessAt,
        last7Days: Object.fromEntries(week.map((w) => [w.outcome, w.n])) as Record<string, number>,
        recentDeliveries: recent,
      });
    }
    return result;
  });
}

// ---------- Snapshot (§5.4) ----------

export type Fact = {
  id: string;
  section: 'account' | 'features' | 'payments' | 'webhooks';
  key: string;
  label: string;
  value: string;
  record: { table: string; id: number };
};
export type AccountSnapshot = {
  as_of: string;
  facts: Fact[];
  empty: { section: Fact['section']; note: string }[];
};

const FEATURE_LABEL: Record<(typeof FEATURES)[number], string> = {
  sso: 'SSO',
  webhooks: 'Webhooks',
  api_access: 'API access',
  audit_logs: 'Audit logs',
};
const regionName = new Intl.DisplayNames('en', { type: 'region' });
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1).replace('_', ' ');

/** Ported from the prototype's `factsFor`: F ids in a fixed order, empty sections explicit. */
export async function buildAccountSnapshot(accountId: unknown, asOf = utcToday()): Promise<AccountSnapshot> {
  const account = await getAccountDetails(accountId);
  const { payments: pays, firstSucceeded } = await getRecentPayments(account.id, 10, asOf);
  const endpoints = await getWebhookStatus(account.id, asOf);

  const facts: Fact[] = [];
  const empty: AccountSnapshot['empty'] = [];
  const add = (section: Fact['section'], key: string, label: string, value: string, record: Fact['record']) =>
    facts.push({ id: `F${facts.length + 1}`, section, key, label, value, record });

  const acc = { table: 'accounts', id: account.id };
  add('account', 'plan', 'Plan', cap(account.plan), acc);
  add('account', 'status', 'Status', cap(account.status), acc);
  add('account', 'interval', 'Billing interval', cap(account.billingInterval), acc);
  add('account', 'region', 'Region', `${regionName.of(account.region)} (${account.region})`, acc);
  add('account', 'since', 'Customer since', fmtDate(account.customerSince), acc);
  for (const f of account.features) {
    add('features', `feat:${f.feature}`, FEATURE_LABEL[f.feature], f.enabled ? 'On' : 'Off', acc);
  }

  if (!pays.length) {
    empty.push({ section: 'payments', note: 'No payments recorded (0 rows)' });
  }
  for (const p of pays) {
    const value = [
      fmtDate(isoDate(p.occurredAt)),
      p.amount,
      p.status,
      p.description,
      p.failureCode,
      `${p.daysSince} days before ${fmtDate(asOf)}`,
    ];
    add('payments', `pay:${p.ref}`, 'Payment', value.filter(Boolean).join(' · '), { table: 'payments', id: p.id });
  }
  if (firstSucceeded) {
    add('payments', 'pay:first', 'First succeeded payment', fmtDate(isoDate(firstSucceeded.occurredAt)), {
      table: 'payments',
      id: firstSucceeded.id,
    });
  }

  if (!endpoints.length) {
    empty.push({ section: 'webhooks', note: 'No webhook endpoints configured (0 rows)' });
  }
  endpoints.forEach((e, i) => {
    const record = { table: 'webhook_endpoints', id: e.id };
    const config = [e.scheme, e.enabled ? 'enabled' : 'disabled', e.events.join(', ')].join(' · ');
    add('webhooks', `wh:${e.ref}:config`, `Endpoint ${i + 1}`, config, record);

    const latest = e.recentDeliveries[0];
    const ok = e.last7Days.success ?? 0;
    const total = Object.values(e.last7Days).reduce((a, b) => a + b, 0);
    const status = [
      e.consecutiveFailures
        ? `${e.consecutiveFailures} consecutive failures (${latest?.httpStatus ? `HTTP ${latest.httpStatus}` : latest?.outcome})`
        : 'No current failures',
      `last success ${e.lastSuccessAt ? fmtDateTime(e.lastSuccessAt.toISOString()) : 'none'}`,
      `last 7 days: ${ok} succeeded, ${total - ok} failed`,
    ];
    add('webhooks', `wh:${e.ref}:status`, `Endpoint ${i + 1} deliveries`, status.join(' · '), record);
  });

  return { as_of: asOf, facts, empty };
}

// ---------- Signals (§5.5) ----------

export type Signal = {
  key: 'webhook_failing' | 'payment_failed' | 'past_due' | 'canceled' | 'enterprise';
  label: string;
  category: 'impact' | 'money' | 'account' | 'tier';
  tone: 'negative' | 'alert' | 'neutral' | 'outline';
};

/** SIG-01: badges in category order (Impact, Money, Account, Tier), computed at read time. */
export async function getAccountSignals(accountId: unknown): Promise<Signal[]> {
  const account = await getAccountDetails(accountId);
  const { payments: [latest] } = await getRecentPayments(account.id, 1);
  const endpoints = await getWebhookStatus(account.id);

  const signals: Signal[] = [];
  if (endpoints.some((e) => e.enabled && e.consecutiveFailures >= WEBHOOK_FAILING_STREAK)) {
    signals.push({ key: 'webhook_failing', label: 'Webhook failing', category: 'impact', tone: 'negative' });
  }
  if (latest?.status === 'failed') {
    signals.push({ key: 'payment_failed', label: 'Payment failed', category: 'money', tone: 'negative' });
  }
  if (account.status === 'past_due') {
    signals.push({ key: 'past_due', label: 'Past due', category: 'money', tone: 'alert' });
  }
  if (account.status === 'canceled') {
    signals.push({ key: 'canceled', label: 'Canceled', category: 'account', tone: 'neutral' });
  }
  if (account.plan === 'enterprise') {
    signals.push({ key: 'enterprise', label: 'Enterprise', category: 'tier', tone: 'outline' });
  }
  return signals;
}
