import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { ProviderError } from '../src/llm/errors.ts';
import { stubProvider } from '../src/llm/stub.ts';
import type { Provider } from '../src/llm/types.ts';
import { seed } from '../src/seed.ts';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { runWorker } from '../src/worker.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';
const GOOD = ['Do you support SAML SSO?', 'How is customer data encrypted at rest?'];
const BROKEN = 'Zebra marmalade failure question';

let app: Awaited<ReturnType<typeof buildTestApp>>;
let cookies: Record<string, string>;
let other: Record<string, string>;
const logLines: Record<string, unknown>[] = [];

async function login(email: string) {
  const res = await app.inject(
    asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } }),
  );
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
}

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  await runWorker({ once: true });
  app = await buildTestApp();
  cookies = await login('ada@omena.example');
  other = await login('rei@omena.example');
});

afterAll(async () => {
  await app.close();
});

describe.sequential('GET /api/rfps/:id/processing', () => {
  it('reports attempts, error code, counts and one row per provider call after a run with one failure', async () => {
    const created = await app.inject(
      asBrowser({
        method: 'POST',
        url: '/api/rfps',
        cookies,
        payload: { title: 'Processing', questions: [...GOOD, BROKEN].map((text) => ({ text })) },
      }),
    );
    const rfpId = created.json().id as number;
    await app.inject(asBrowser({ method: 'POST', url: `/api/rfps/${rfpId}/generate`, cookies }));

    const stub = stubProvider();
    const provider: Provider = {
      ...stub,
      generateStructured: async (input, deadline) => {
        if (input.prompt.includes(BROKEN)) {
          throw new ProviderError('INVALID_OUTPUT', 'malformed', true);
        }
        return stub.generateStructured(input, deadline);
      },
    };
    await runWorker({
      once: true,
      rfp: { provider, sleep: async () => {}, workerLog: (line) => logLines.push(line) },
    });

    const res = await app.inject(asBrowser({ method: 'GET', url: `/api/rfps/${rfpId}/processing`, cookies: other }));
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.questions.map((q: { status: string }) => q.status)).toEqual(['done', 'done', 'failed']);
    const [first, , failed] = body.questions;
    expect(first.attempts).toBe(1);
    expect(first.errorCode).toBeNull();
    expect(first.retrievedCount).toBeGreaterThan(0);
    expect(first.citedCount).toBeGreaterThan(0);
    expect(first.calls.map((c: { kind: string }) => c.kind)).toEqual(['embed_query', 'rfp_generate']);
    expect(first.calls.every((c: { latencyMs: number | null }) => c.latencyMs != null)).toBe(true);

    expect(failed).toMatchObject({ errorCode: 'INVALID_OUTPUT', retrievedCount: 0, citedCount: 0 });
    const generate = failed.calls.filter((c: { kind: string }) => c.kind === 'rfp_generate');
    expect(generate).toHaveLength(3);
    expect(generate.every((c: { status: string; errorCode: string }) => c.status === 'error' && c.errorCode === 'INVALID_OUTPUT')).toBe(true);

    expect(body.totals.failures).toBe(3);
    expect(body.totals.calls).toBe(body.questions.reduce((n: number, q: { calls: unknown[] }) => n + q.calls.length, 0));
    expect(body.totals.p95LatencyMs).not.toBeNull();
  });

  it('logs ids and counts per processed question and never the question text (SEC-11)', () => {
    expect(logLines).toHaveLength(3);
    for (const line of logLines) {
      expect(Object.keys(line).sort()).toEqual(
        ['attempt', 'errorCode', 'evidenceStatus', 'latencyMs', 'msg', 'questionId', 'retrievedCount', 'rfpId', 'status'].sort(),
      );
    }
    expect(logLines.map((l) => l.status)).toEqual(['done', 'done', 'failed']);
    expect(logLines[0]!.retrievedCount).toBeGreaterThan(0);
    expect(logLines[2]).toMatchObject({ errorCode: 'INVALID_OUTPUT', retrievedCount: null });
    const text = JSON.stringify(logLines);
    for (const q of [...GOOD, BROKEN]) {
      expect(text).not.toContain(q);
    }
  });

  it('404s for an unknown RFP', async () => {
    const res = await app.inject(asBrowser({ method: 'GET', url: '/api/rfps/999999/processing', cookies }));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('RFP_NOT_FOUND');
  });
});
