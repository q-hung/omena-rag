import { addDays, addHours } from '../src/lib/format.ts';
import type {
  ACCOUNT_STATUSES,
  BILLING_INTERVALS,
  DELIVERY_OUTCOMES,
  FEATURES,
  PAYMENT_STATUSES,
  PLANS,
} from '../src/db/schema.ts';

// REQ §5.2. Every date is relative to the seed day D, so the scenarios in
// §13.1 stay true however long after the seed the demo runs.

export type SeedPayment = {
  ref: string;
  occurredAt: string;
  amountMinor: number;
  currency: string;
  status: (typeof PAYMENT_STATUSES)[number];
  description: string;
  failureCode?: string;
};

export type SeedDelivery = {
  attemptedAt: string;
  eventType: string;
  outcome: (typeof DELIVERY_OUTCOMES)[number];
  httpStatus: number | null;
};

export type SeedEndpoint = {
  ref: string;
  url: string;
  enabled: boolean;
  events: string[];
  deliveries: SeedDelivery[];
};

export type SeedAccount = {
  ref: string;
  companyName: string;
  plan: (typeof PLANS)[number];
  status: (typeof ACCOUNT_STATUSES)[number];
  billingInterval: (typeof BILLING_INTERVALS)[number];
  region: string;
  customerSince: string;
  features: (typeof FEATURES)[number][];
  payments: SeedPayment[];
  endpoints: SeedEndpoint[];
};

const EVENTS = ['subscription.created', 'invoice.paid'];

const payment = (
  ref: string,
  d: string,
  offsetDays: number,
  amountMinor: number,
  currency: string,
  status: SeedPayment['status'],
  description: string,
  failureCode?: string,
): SeedPayment => ({
  ref,
  occurredAt: `${addDays(d, offsetDays)}T09:00:00Z`,
  amountMinor,
  currency,
  status,
  description,
  ...(failureCode ? { failureCode } : {}),
});

/** `count` deliveries from `start`, every `stepHours`, all with the same outcome. */
const run = (
  start: string,
  stepHours: number,
  count: number,
  outcome: SeedDelivery['outcome'],
  httpStatus: number | null,
): SeedDelivery[] =>
  Array.from({ length: count }, (_, i) => ({
    attemptedAt: addHours(start, i * stepHours),
    eventType: EVENTS[i % 2]!,
    outcome,
    httpStatus,
  }));

const healthy = (d: string, ref: string, url: string): SeedEndpoint => ({
  ref,
  url,
  enabled: true,
  events: EVENTS,
  deliveries: run(`${addDays(d, -7)}T16:00:00Z`, 8, 20, 'success', 200),
});

export function seedAccounts(d: string): SeedAccount[] {
  return [
    {
      ref: 'A-1001',
      companyName: 'Clara Studio',
      plan: 'basic',
      status: 'active',
      billingInterval: 'monthly',
      region: 'FI',
      customerSince: addDays(d, -62),
      features: [],
      payments: [
        payment('PAY-1101', d, -62, 2900, 'EUR', 'succeeded', 'Basic monthly'),
        payment('PAY-1102', d, -32, 2900, 'EUR', 'succeeded', 'Basic monthly'),
        payment('PAY-1103', d, -2, 2900, 'EUR', 'succeeded', 'Basic monthly'),
      ],
      endpoints: [],
    },
    {
      ref: 'A-1002',
      companyName: 'Becker Bikes',
      plan: 'pro',
      status: 'active',
      billingInterval: 'monthly',
      region: 'DE',
      customerSince: addDays(d, -20),
      features: ['api_access', 'webhooks'],
      payments: [payment('PAY-1201', d, -20, 9900, 'EUR', 'succeeded', 'Pro monthly')],
      endpoints: [],
    },
    {
      ref: 'A-1003',
      companyName: 'Orbit Meals',
      plan: 'enterprise',
      status: 'active',
      billingInterval: 'annual',
      region: 'GB',
      customerSince: addDays(d, -374),
      features: ['sso', 'webhooks', 'api_access', 'audit_logs'],
      payments: [
        payment('PAY-1301', d, -374, 480000, 'GBP', 'succeeded', 'Enterprise annual'),
        payment('PAY-1302', d, -9, 480000, 'GBP', 'succeeded', 'Enterprise annual'),
        payment('PAY-1303', d, -5, 60000, 'GBP', 'succeeded', 'Extra seats'),
      ],
      endpoints: [
        healthy(d, 'WH-1', 'https://orders.orbit.example/hooks'),
        healthy(d, 'WH-2', 'https://staging.orbit.example/hooks'),
      ],
    },
    {
      ref: 'A-1004',
      companyName: 'Northwind Coffee',
      plan: 'pro',
      status: 'active',
      billingInterval: 'monthly',
      region: 'US',
      customerSince: addDays(d, -74),
      features: ['api_access', 'webhooks'],
      payments: [
        payment('PAY-1401', d, -74, 9900, 'USD', 'succeeded', 'Pro monthly'),
        payment('PAY-1402', d, -44, 9900, 'USD', 'succeeded', 'Pro monthly'),
        payment('PAY-1403', d, -14, 9900, 'USD', 'succeeded', 'Pro monthly'),
      ],
      endpoints: [
        {
          ref: 'WH-1',
          url: 'https://crm.northwind.example/subpilot',
          enabled: true,
          events: EVENTS,
          // S3: a healthy history, then 12 consecutive 401s since D-1.
          deliveries: [
            ...run(`${addDays(d, -2)}T10:00:00Z`, 2, 8, 'success', 200),
            ...run(`${addDays(d, -1)}T02:00:00Z`, 2, 12, 'http_error', 401),
          ],
        },
        healthy(d, 'WH-2', 'https://ops.northwind.example/events'),
      ],
    },
    {
      ref: 'A-1005',
      companyName: 'Feira Box',
      plan: 'pro',
      status: 'past_due',
      billingInterval: 'monthly',
      region: 'PT',
      customerSince: addDays(d, -35),
      features: ['api_access'],
      payments: [
        payment('PAY-1501', d, -35, 9900, 'EUR', 'succeeded', 'Pro monthly'),
        payment('PAY-1502', d, -5, 9900, 'EUR', 'failed', 'Pro monthly', 'card_declined'),
      ],
      endpoints: [],
    },
  ];
}

export const SEED_EMPLOYEES = [
  { email: 'ada@omena.example', name: 'Ada Nwosu' },
  { email: 'rei@omena.example', name: 'Rei Tanaka' },
] as const;
