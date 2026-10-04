import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth.ts';
import { db } from '../src/db/index.ts';
import {
  accounts,
  answers,
  answerSources,
  conversations,
  documentChunks,
  documentFiles,
  documentVersions,
  documents,
  employees,
  reviewedAnswers,
  turns,
} from '../src/db/schema.ts';
import { utcToday } from '../src/lib/format.ts';
import { seed } from '../src/seed.ts';
import { queueDocument, queueVersion } from '../src/upload.ts';
import { asBrowser, buildTestApp } from './helpers/app.ts';

const PASSWORD = 'test-password';
const unit = () => {
  const v = new Array<number>(768).fill(0);
  v[0] = 1;
  return v;
};

let app: Awaited<ReturnType<typeof buildTestApp>>;
let cookie: { [SESSION_COOKIE]: string };
let employeeId: number;
let accountId: number;

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: PASSWORD });
  app = await buildTestApp();
  const login = await app.inject(
    asBrowser({ method: 'POST', url: '/api/auth/login', payload: { email: 'ada@omena.example', password: PASSWORD } }),
  );
  cookie = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
  const [employee] = await db().select().from(employees).where(eq(employees.email, 'ada@omena.example'));
  const [account] = await db().select().from(accounts).limit(1);
  employeeId = employee!.id;
  accountId = account!.id;
});

afterAll(async () => {
  await app.close();
});

async function readyDoc(title: string, activeText: string, hiddenText: string) {
  const created = await queueDocument({
    title,
    category: 'FAQ',
    effectiveAt: utcToday(),
    filename: 'v1.md',
    bytes: Buffer.from(`# Hidden\n${hiddenText}\n`, 'utf8'),
    employeeId,
  });
  await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, created.version.id));
  await db().insert(documentChunks).values({
    versionId: created.version.id,
    chunkIndex: 0,
    heading: 'Hidden',
    pageNumber: null,
    text: hiddenText,
    embedding: unit(),
    embeddingModel: 'gemini-embedding-2',
  });
  const next = await queueVersion(created.document.id, {
    effectiveAt: utcToday(),
    filename: 'v2.md',
    bytes: Buffer.from(`# Visible\n${activeText}\n`, 'utf8'),
    employeeId,
  });
  await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, next.version.id));
  await db().update(documents).set({ activeVersionId: next.version.id }).where(eq(documents.id, created.document.id));
  await db().insert(documentChunks).values({
    versionId: next.version.id,
    chunkIndex: 0,
    heading: 'Visible',
    pageNumber: null,
    text: activeText,
    embedding: unit(),
    embeddingModel: 'gemini-embedding-2',
  });
  return { documentId: created.document.id, v1: created.version.id, v2: next.version.id };
}

describe('KB management API', () => {
  it('searches titles and active-version text only', async () => {
    const { documentId } = await readyDoc('Searchable title', 'unique-active-phrase', 'unique-hidden-phrase');
    const hidden = await app.inject({
      method: 'GET',
      url: '/api/documents?q=unique-hidden-phrase',
      cookies: cookie,
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().documents.map((d: { id: number }) => d.id)).not.toContain(documentId);

    const active = await app.inject({
      method: 'GET',
      url: '/api/documents?q=unique-active-phrase',
      cookies: cookie,
    });
    expect(active.json().documents.map((d: { id: number }) => d.id)).toContain(documentId);
  });

  it('rejects retry on a non-latest version', async () => {
    const created = await queueDocument({
      title: 'Retry latest',
      category: 'Plans',
      effectiveAt: utcToday(),
      filename: 'old.md',
      bytes: Buffer.from('# Old\nFail.\n', 'utf8'),
      employeeId,
    });
    await db()
      .update(documentVersions)
      .set({ indexingStatus: 'failed', indexingError: 'broken' })
      .where(eq(documentVersions.id, created.version.id));
    const later = await queueVersion(created.document.id, {
      effectiveAt: utcToday(),
      filename: 'new.md',
      bytes: Buffer.from('# New\nAlso fail.\n', 'utf8'),
      employeeId,
    });
    await db()
      .update(documentVersions)
      .set({ indexingStatus: 'failed', indexingError: 'broken' })
      .where(eq(documentVersions.id, later.version.id));

    const response = await app.inject(
      asBrowser({
        method: 'POST',
        url: `/api/documents/${created.document.id}/versions/${created.version.id}/retry`,
        cookies: cookie,
      }),
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_LATEST');
  });

  it('deletes versions, files and chunks and leaves reviewed answers', async () => {
    const created = await queueDocument({
      title: 'Delete me',
      category: 'Billing',
      effectiveAt: utcToday(),
      filename: 'gone.md',
      bytes: Buffer.from('# Gone\nCited once.\n', 'utf8'),
      employeeId,
    });
    await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, created.version.id));
    await db().update(documents).set({ activeVersionId: created.version.id }).where(eq(documents.id, created.document.id));
    const [chunk] = await db()
      .insert(documentChunks)
      .values({
        versionId: created.version.id,
        chunkIndex: 0,
        heading: 'Gone',
        pageNumber: null,
        text: 'Cited once.',
        embedding: unit(),
        embeddingModel: 'gemini-embedding-2',
      })
      .returning();

    const [conversation] = await db()
      .insert(conversations)
      .values({ accountId, createdBy: employeeId })
      .returning();
    const [turn] = await db()
      .insert(turns)
      .values({
        conversationId: conversation!.id,
        seq: 1,
        kind: 'question',
        text: 'Why?',
        createdBy: employeeId,
      })
      .returning();
    const [answer] = await db()
      .insert(answers)
      .values({
        conversationId: conversation!.id,
        turnId: turn!.id,
        createdBy: employeeId,
        outcome: 'answer',
        answerText: 'Because.',
        factsSnapshot: [],
        asOf: '2026-10-02',
        model: 'stub',
        promptVersion: '1',
      })
      .returning();
    await db().insert(answerSources).values({
      answerId: answer!.id,
      rank: 1,
      chunkId: chunk!.id,
      score: 0.9,
      citationNumber: 1,
    });
    const sources = [{ document_id: created.document.id, version_id: created.version.id }];
    const [reviewed] = await db()
      .insert(reviewedAnswers)
      .values({
        conversationId: conversation!.id,
        answerId: answer!.id,
        finalText: 'Because.',
        sources,
        facts: [],
        reviewAcknowledged: true,
        reviewerId: employeeId,
      })
      .returning();

    const deleted = await app.inject(
      asBrowser({ method: 'DELETE', url: `/api/documents/${created.document.id}`, cookies: cookie }),
    );
    expect(deleted.statusCode).toBe(204);
    expect(await db().select().from(documents).where(eq(documents.id, created.document.id))).toEqual([]);
    expect(await db().select().from(documentVersions).where(eq(documentVersions.documentId, created.document.id))).toEqual([]);
    expect(await db().select().from(documentFiles).where(eq(documentFiles.versionId, created.version.id))).toEqual([]);
    expect(await db().select().from(documentChunks).where(eq(documentChunks.versionId, created.version.id))).toEqual([]);
    const [kept] = await db().select().from(reviewedAnswers).where(eq(reviewedAnswers.id, reviewed!.id));
    expect(kept?.finalText).toBe('Because.');
    expect(kept?.sources).toEqual(sources);
  });

  it('reports indexing-status busy when a version is queued', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/documents/indexing-status' });
    expect(anon.statusCode).toBe(401);

    await queueDocument({
      title: 'Still indexing',
      category: 'FAQ',
      effectiveAt: utcToday(),
      filename: 'wait.md',
      bytes: Buffer.from('# Wait\nQueued.\n', 'utf8'),
      employeeId,
    });
    const busy = await app.inject({ method: 'GET', url: '/api/documents/indexing-status', cookies: cookie });
    expect(busy.statusCode).toBe(200);
    expect(busy.json()).toEqual({ busy: true });
  });

  it('counts unsaved and saved answers that cite a document', async () => {
    const created = await queueDocument({
      title: 'Impact me',
      category: 'Billing',
      effectiveAt: utcToday(),
      filename: 'cited.md',
      bytes: Buffer.from('# Cited\nUsed once.\n', 'utf8'),
      employeeId,
    });
    await db().update(documentVersions).set({ indexingStatus: 'ready' }).where(eq(documentVersions.id, created.version.id));
    const [chunk] = await db()
      .insert(documentChunks)
      .values({
        versionId: created.version.id,
        chunkIndex: 0,
        heading: 'Cited',
        pageNumber: null,
        text: 'Used once.',
        embedding: unit(),
        embeddingModel: 'gemini-embedding-2',
      })
      .returning();

    const empty = await app.inject({
      method: 'GET',
      url: `/api/documents/${created.document.id}/impact`,
      cookies: cookie,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ unsaved: 0, saved: 0 });

    const missing = await app.inject({ method: 'GET', url: '/api/documents/999999/impact', cookies: cookie });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('DOCUMENT_NOT_FOUND');

    const anon = await app.inject({ method: 'GET', url: `/api/documents/${created.document.id}/impact` });
    expect(anon.statusCode).toBe(401);

    const cite = async (reviewed: boolean) => {
      const [conversation] = await db().insert(conversations).values({ accountId, createdBy: employeeId }).returning();
      const [turn] = await db()
        .insert(turns)
        .values({ conversationId: conversation!.id, seq: 1, kind: 'question', text: 'Why?', createdBy: employeeId })
        .returning();
      const [answer] = await db()
        .insert(answers)
        .values({
          conversationId: conversation!.id,
          turnId: turn!.id,
          createdBy: employeeId,
          outcome: 'answer',
          answerText: 'Because.',
          factsSnapshot: [],
          asOf: '2026-10-02',
          model: 'stub',
          promptVersion: '1',
        })
        .returning();
      await db().insert(answerSources).values({
        answerId: answer!.id,
        rank: 1,
        chunkId: chunk!.id,
        score: 0.9,
        citationNumber: 1,
      });
      if (reviewed) {
        await db().insert(reviewedAnswers).values({
          conversationId: conversation!.id,
          answerId: answer!.id,
          finalText: 'Because.',
          sources: [{ document_id: created.document.id, version_id: created.version.id }],
          facts: [],
          reviewAcknowledged: true,
          reviewerId: employeeId,
        });
      }
    };
    await cite(false);
    await cite(true);

    const impact = await app.inject({
      method: 'GET',
      url: `/api/documents/${created.document.id}/impact`,
      cookies: cookie,
    });
    expect(impact.statusCode).toBe(200);
    expect(impact.json()).toEqual({ unsaved: 1, saved: 1 });
  });

  it('rejects an unauthenticated download', async () => {
    const created = await queueDocument({
      title: 'Private file',
      category: 'Security',
      effectiveAt: utcToday(),
      filename: 'secret.md',
      bytes: Buffer.from('# Secret\nDo not leak.\n', 'utf8'),
      employeeId,
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/documents/${created.document.id}/versions/${created.version.id}/file`,
    });
    expect(response.statusCode).toBe(401);
  });
});
