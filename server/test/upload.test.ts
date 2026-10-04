import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/services/auth.service.ts';
import { db } from '../src/db/index.ts';
import { documentFiles, documentVersions, documents } from '../src/db/schema.ts';
import { utcToday } from '../src/lib/format.ts';
import { addDays } from '../src/lib/format.ts';
import { FILE_SIZE_LIMIT } from '../src/services/document-upload.service.ts';
import { seed } from '../src/seed.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';
import { multipart } from './helpers/multipart.ts';

const PASSWORD = 'test-password';
let app: Awaited<ReturnType<typeof buildTestApp>>;
let cookie: { [SESSION_COOKIE]: string };

const post = (url: string, fields: Record<string, string>, file?: { name: string; bytes: Buffer }) => {
  const body = multipart(fields, file);
  return app.inject(
    asBrowser({ method: 'POST', url, cookies: cookie, headers: body.headers, payload: body.payload }),
  );
};

const md = (name: string, text: string) => ({
  name,
  bytes: Buffer.from(text, 'utf8'),
});

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  app = await buildTestApp();
  const login = await app.inject(
    asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email: 'ada@omena.example', password: PASSWORD } }),
  );
  cookie = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
});

afterAll(async () => {
  await app.close();
});

describe('upload API', () => {
  it('rejects a .pdf whose bytes are a PNG', async () => {
    const response = await post(
      '/api/documents',
      { title: 'Scan', category: 'Billing', effectiveDate: utcToday() },
      { name: 'scan.pdf', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]) },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_FILE');
  });

  it('rejects a 3.1 MB file with 413 FILE_TOO_LARGE', async () => {
    const response = await post(
      '/api/documents',
      { title: 'Huge', category: 'FAQ', effectiveDate: utcToday() },
      { name: 'huge.md', bytes: Buffer.alloc(Math.ceil(3.1 * 1024 * 1024), 0x61) },
    );
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('FILE_TOO_LARGE');
    expect(FILE_SIZE_LIMIT).toBe(3 * 1024 * 1024);
  });

  it('rejects Markdown that is not UTF-8', async () => {
    const response = await post(
      '/api/documents',
      { title: 'Bad', category: 'FAQ', effectiveDate: utcToday() },
      { name: 'bad.md', bytes: Buffer.from([0x23, 0x20, 0xff, 0xfe]) },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_FILE');
  });

  it('accepts a valid .md with no leading signature', async () => {
    const response = await post(
      '/api/documents',
      { title: 'Cancellation policy', category: 'Policies', effectiveDate: utcToday(), note: 'First version.' },
      md('cancellation-policy.md', 'Workspace owners can cancel under Settings → Billing.\n'),
    );
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.version.indexingStatus).toBe('queued');
    const [file] = await db().select().from(documentFiles).where(eq(documentFiles.versionId, body.version.id));
    expect(file).toBeTruthy();
    const [version] = await db().select().from(documentVersions).where(eq(documentVersions.id, body.version.id));
    expect(version?.indexingStatus).toBe('queued');
  });

  it('rejects a future effective date', async () => {
    const response = await post(
      '/api/documents',
      { title: 'Future', category: 'Plans', effectiveDate: addDays(utcToday(), 1) },
      md('future.md', '# Later\nNot yet.\n'),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_DATE');
  });

  it('rejects a replace whose hash matches the active version', async () => {
    const created = await post(
      '/api/documents',
      { title: 'Hash doc', category: 'Developer', effectiveDate: utcToday() },
      md('same.md', '# Same\nIdentical bytes.\n'),
    );
    const documentId = created.json().document.id;
    const versionId = created.json().version.id;
    await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, versionId));
    await db().update(documents).set({ activeVersionId: versionId }).where(eq(documents.id, documentId));

    const again = await post(
      `/api/documents/${documentId}/versions`,
      { effectiveDate: utcToday(), note: 'Retry same file' },
      md('same.md', '# Same\nIdentical bytes.\n'),
    );
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('DUPLICATE_HASH');
  });

  it('rejects a replace while another version is queued', async () => {
    const created = await post(
      '/api/documents',
      { title: 'In flight', category: 'Security', effectiveDate: utcToday() },
      md('v1.md', '# One\nFirst.\n'),
    );
    const documentId = created.json().document.id;
    expect(created.statusCode).toBe(201);

    const replace = await post(
      `/api/documents/${documentId}/versions`,
      { effectiveDate: utcToday(), note: 'Too soon' },
      md('v2.md', '# Two\nSecond.\n'),
    );
    expect(replace.statusCode).toBe(409);
    expect(replace.json().error.code).toBe('INDEXING_IN_PROGRESS');
  });
});
