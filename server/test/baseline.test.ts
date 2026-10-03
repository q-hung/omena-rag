import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/errors.ts';
import { LogCapture, TEST_ORIGIN, asBrowser, buildTestApp } from './helpers/app.ts';

const SECRET = 'the customer asked about a refund';

const logs = new LogCapture();
let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp(logs, (instance) => {
    instance.post(
      '/api/echo',
      { schema: { body: z.object({ question: z.string().min(1) }) } },
      async (request) => ({ length: request.body.question.length }),
    );
    instance.get('/api/boom', async () => {
      throw new AppError(409, 'ALREADY_SAVED', 'This conversation is already saved.');
    });
    instance.get('/api/crash', async () => {
      throw new Error('unexpected');
    });
  });
});

afterAll(async () => {
  await app.close();
});

describe('fastify baseline', () => {
  it('sets a strict CSP (SEC-04)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/boom' });
    expect(response.headers['content-security-policy']).toBe("default-src 'self'");
  });

  it('returns a request id on every response', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/boom' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a mutating request from a foreign origin (SEC-03)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { origin: 'https://evil.example' },
      payload: { question: SECRET },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: 'FORBIDDEN_ORIGIN', message: 'This request did not come from the app.' },
    });
  });

  it('rejects a mutating request with no origin at all', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/echo', payload: { question: 'x' } });
    expect(response.statusCode).toBe(403);
  });

  it('accepts a mutating request from the app origin', async () => {
    const response = await app.inject(
      asBrowser({ method: 'POST', url: '/api/echo', payload: { question: SECRET } }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ length: SECRET.length });
  });

  it('does not require an origin for reads', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/boom' });
    expect(response.statusCode).toBe(409);
  });

  it('uses one error shape for expected, validation and unexpected failures', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/boom' })).json()).toEqual({
      error: { code: 'ALREADY_SAVED', message: 'This conversation is already saved.' },
    });

    const invalid = await app.inject(
      asBrowser({ method: 'POST', url: '/api/echo', payload: { question: '' } }),
    );
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_FAILED');

    const crashed = await app.inject({ method: 'GET', url: '/api/crash' });
    expect(crashed.statusCode).toBe(500);
    expect(crashed.json()).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
    expect(crashed.json().error.message).not.toContain('unexpected');

    const missing = await app.inject({ method: 'GET', url: '/api/nowhere' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
  });

  it('logs only allow-listed fields, never a request body (SEC-11)', async () => {
    logs.lines.length = 0;
    await app.inject(asBrowser({ method: 'POST', url: '/api/echo', payload: { question: SECRET } }));

    expect(logs.text).not.toContain(SECRET);
    const line = logs.lines.find((l) => l.route === '/api/echo');
    expect(line).toBeDefined();
    expect(Object.keys(line!).sort()).toEqual(
      ['hostname', 'latencyMs', 'level', 'method', 'pid', 'reqId', 'route', 'status', 'time'].sort(),
    );
    expect(line!.status).toBe(200);
    expect(line!.reqId).toMatch(/^[0-9a-f-]{36}$/);
    expect(TEST_ORIGIN).toContain('localhost');
  });
});
