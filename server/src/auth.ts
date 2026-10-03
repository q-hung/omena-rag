import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from './app.ts';
import type { Config } from './config.ts';
import { db } from './db/index.ts';
import { employees, sessions } from './db/schema.ts';
import { tooManyRequests, unauthorized } from './errors.ts';

// AUTH-01, SEC-01, SEC-02.
export const SESSION_COOKIE = 'jarvis_session';
const PUBLIC_ROUTES = new Set(['/api/auth/login']);
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Verifying against a throwaway hash keeps an unknown email as slow as a wrong password.
const dummyHash = hash(randomBytes(16).toString('hex'), { algorithm: 2 });

// ponytail: in-memory, per process; move to Postgres if the API ever runs more than one instance.
const attempts = new Map<string, { count: number; resetAt: number }>();

function limitLogin(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (++entry.count > MAX_ATTEMPTS) {
    throw tooManyRequests('TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Try again in a minute.');
  }
}

export function registerAuth(app: App, config: Config): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
  } as const;

  // Every /api route except login needs a session, including unknown ones,
  // so a missing route never tells an anonymous caller more than a 401.
  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0]!;
    if (!path.startsWith('/api/') || PUBLIC_ROUTES.has(path)) return;

    const token = request.cookies[SESSION_COOKIE];
    if (!token) throw unauthorized();
    const [session] = await db()
      .select({ employeeId: sessions.employeeId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
    if (!session) throw unauthorized();
    request.employeeId = session.employeeId;
  });

  app.post(
    '/api/auth/login',
    {
      schema: {
        body: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }),
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      limitLogin(`${email}|${request.ip}`);

      const [employee] = await db().select().from(employees).where(eq(employees.email, email));
      const ok = await verify(employee?.passwordHash ?? (await dummyHash), password);
      if (!employee || !ok) throw unauthorized('Email or password is incorrect.');

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + config.SESSION_HOURS * 3_600_000);
      await db().insert(sessions).values({ tokenHash: hashToken(token), employeeId: employee.id, expiresAt });

      request.employeeId = employee.id;
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
      return { employee: { id: employee.id, email: employee.email, name: employee.name } };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    await db().delete(sessions).where(eq(sessions.tokenHash, hashToken(request.cookies[SESSION_COOKIE]!)));
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get('/api/me', async (request) => {
    const [employee] = await db()
      .select({ id: employees.id, email: employees.email, name: employees.name })
      .from(employees)
      .where(eq(employees.id, request.employeeId!));
    return { employee, simulated: config.LLM_PROVIDER === 'stub' };
  });
}
