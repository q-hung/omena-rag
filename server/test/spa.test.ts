import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.ts';

const dir = mkdtempSync(join(tmpdir(), 'jarvis-spa-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Jarvis</title>');

let app: Awaited<ReturnType<typeof buildTestApp>>;
const prev = process.env.STATIC_DIR;

beforeAll(async () => {
  process.env.STATIC_DIR = dir;
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
  if (prev === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe('SPA fallback', () => {
  it('serves index.html for /ask with CSP', async () => {
    const response = await app.inject({ method: 'GET', url: '/ask' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(response.body).toContain('Jarvis');
  });

  it('keeps /api 401 for anonymous callers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(response.statusCode).toBe(401);
  });
});
