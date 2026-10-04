import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import { seed } from '../src/seed.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';
let app: Awaited<ReturnType<typeof buildTestApp>>;
let cookie: { [SESSION_COOKIE]: string };

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  app = await buildTestApp();
  const login = await app.inject(asBrowser({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'ada@omena.example', password: PASSWORD },
  }));
  cookie = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
});

afterAll(async () => {
  await app.close();
});

describe('accounts API', () => {
  it('lists accounts with their signals', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/accounts', cookies: cookie });
    expect(response.statusCode).toBe(200);
    const northwind = response.json().accounts.find((account: { ref: string }) => account.ref === 'A-1004');
    expect(northwind.signals.map((signal: { label: string }) => signal.label)).toEqual(['Webhook failing']);
  });

  it('returns facts without private record references', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/accounts', cookies: cookie });
    const account = list.json().accounts.find((row: { ref: string }) => row.ref === 'A-1004');
    const response = await app.inject({
      method: 'GET',
      url: `/api/accounts/${account.id}/facts`,
      cookies: cookie,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().facts.find((fact: { key: string }) => fact.key === 'wh:WH-1:status').value)
      .toMatch(/^12 consecutive failures/);
    expect(response.body).not.toContain('"record"');
  });

  it('returns 404 for an unknown account', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/accounts/999999/facts', cookies: cookie });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('returns 400 for a non-numeric account id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/accounts/not-a-number/facts', cookies: cookie });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });
});
