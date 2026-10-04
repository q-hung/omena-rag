import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth.ts';
import { db } from '../src/db/index.ts';
import { sessions } from '../src/db/schema.ts';
import { seedEmployees } from '../src/seed.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'correct horse';
let app: Awaited<ReturnType<typeof buildTestApp>>;

const login = (email: string, password: string) =>
  app.inject(asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password } }));

const tokenOf = (response: Awaited<ReturnType<typeof login>>) =>
  response.cookies.find((c) => c.name === SESSION_COOKIE)!.value;

const me = (token: string) =>
  app.inject({ method: 'GET', url: '/api/me', cookies: { [SESSION_COOKIE]: token } });

beforeAll(async () => {
  await seedEmployees(db(), PASSWORD);
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('authentication', () => {
  it('logs in, sets a hardened cookie and stores only a token hash', async () => {
    const response = await login('ADA@omena.example', PASSWORD);
    expect(response.statusCode).toBe(200);
    expect(response.json().employee.email).toBe('ada@omena.example');

    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const hours = (cookie.expires!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);

    const rows = await db().select().from(sessions);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.tokenHash === cookie.value)).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(cookie.value);
  });

  it('returns the employee and the simulated flag from /api/me', async () => {
    const response = await me(tokenOf(await login('rei@omena.example', PASSWORD)));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      employee: { id: expect.any(Number), email: 'rei@omena.example', name: 'Rei Tanaka' },
      simulated: true,
    });
  });

  it('rejects a wrong password and an unknown email with 401', async () => {
    expect((await login('rei@omena.example', 'nope')).statusCode).toBe(401);
    const unknown = await login('nobody@omena.example', PASSWORD);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('requires a session on every other route, known or not', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/accounts' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await me('not-a-real-token')).statusCode).toBe(401);
    expect((await app.inject(asBrowser({ method: 'POST', url: '/api/auth/logout' }))).statusCode).toBe(401);
  });

  it('requires a session when the path is percent-encoded (B03)', async () => {
    // The router decodes %61 to "a"; the auth check must see the same route.
    for (const url of ['/%61pi/me', '/%61pi/accounts', '/api/%61ccounts', '/%61pi/documents']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
    const write = await app.inject(asBrowser({ method: 'POST', url: '/%61pi/documents/1/archive' }));
    expect(write.statusCode).toBe(401);
  });

  it('rejects an expired session', async () => {
    const token = tokenOf(await login('ada@omena.example', PASSWORD));
    await db().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await me(token)).statusCode).toBe(401);
  });

  it('logout deletes the session', async () => {
    const token = tokenOf(await login('rei@omena.example', PASSWORD));
    const out = await app.inject(
      asBrowser({ method: 'POST', url: '/api/auth/logout', cookies: { [SESSION_COOKIE]: token } }),
    );
    expect(out.statusCode).toBe(204);
    expect((await me(token)).statusCode).toBe(401);
  });

  it('limits login to 5 attempts per minute per email + IP', async () => {
    const email = 'limit@omena.example';
    for (let i = 0; i < 5; i++) expect((await login(email, 'x')).statusCode).toBe(401);
    const sixth = await login(email, 'x');
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('TOO_MANY_ATTEMPTS');
    // Another email from the same IP is unaffected.
    expect((await login('ada@omena.example', PASSWORD)).statusCode).toBe(200);
  });
});
