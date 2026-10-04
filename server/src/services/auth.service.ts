import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt } from 'drizzle-orm';
import type { Config } from '../config/config.ts';
import { db } from '../db/index.ts';
import { employees, sessions } from '../db/schema.ts';
import { tooManyRequests, unauthorized } from '../errors.ts';

// AUTH-01, SEC-01, SEC-02.
export const SESSION_COOKIE = 'jarvis_session';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Verifying against a throwaway hash keeps an unknown email as slow as a wrong password.
const dummyHash = hash(randomBytes(16).toString('hex'), { algorithm: 2 });

// ponytail: in-memory, per process; move to Postgres if the API ever runs more than one instance.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function limitLogin(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    for (const [k, v] of attempts) {
      if (v.resetAt <= now) {
        attempts.delete(k);
      }
    }
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (++entry.count > MAX_ATTEMPTS) {
    throw tooManyRequests('TOO_MANY_ATTEMPTS', 'Too many sign-in attempts. Try again in a minute.');
  }
}

export async function findSessionEmployee(token: string): Promise<number | null> {
  const [session] = await db()
    .select({ employeeId: sessions.employeeId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return session?.employeeId ?? null;
}

export async function login(
  config: Config,
  input: { email: string; password: string; ip: string },
): Promise<{ token: string; expiresAt: Date; employee: { id: number; email: string; name: string } }> {
  limitLogin(`${input.email}|${input.ip}`);

  const [employee] = await db().select().from(employees).where(eq(employees.email, input.email));
  const ok = await verify(employee?.passwordHash ?? (await dummyHash), input.password);
  if (!employee || !ok) {
    throw unauthorized('Email or password is incorrect.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.SESSION_HOURS * 3_600_000);
  await db().insert(sessions).values({ tokenHash: hashToken(token), employeeId: employee.id, expiresAt });
  return {
    token,
    expiresAt,
    employee: { id: employee.id, email: employee.email, name: employee.name },
  };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }
  await db()
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)));
}

export async function getEmployee(employeeId: number) {
  const [employee] = await db()
    .select({ id: employees.id, email: employees.email, name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId));
  return employee;
}
