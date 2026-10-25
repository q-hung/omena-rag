import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { budgetDays, documentChunks, documentVersions, documents, providerCalls } from '../src/db/schema.ts';
import { buildPdf } from '../src/ingest/extract/pdfBytes.ts';
import { utcToday } from '../src/lib/format.ts';
import { stubProvider } from '../src/llm/stub.ts';
import { seed } from '../src/seed.ts';
import { queueDocument, queueVersion } from '../src/services/document-upload.service.ts';
import { EMBED_BATCH_SIZE } from '../src/ingest/indexing.ts';
import { activateVersion, claimVersion, failStaleProcessing, processVersion, runWorker } from '../src/worker.ts';

const unit = () => {
  const v = new Array<number>(768).fill(0);
  v[0] = 1;
  return v;
};

beforeAll(async () => {
  await seed(db(), { date: '2026-10-02', password: 'test-password' });
  await runWorker({ once: true });
});

afterAll(async () => {});

describe('indexing worker', () => {
  it('indexes the §6.4 fixtures: 11 ready (SSO warned) and 1 failed', async () => {
    const versions = await db().select().from(documentVersions);
    const docs = await db().select().from(documents);
    expect(docs).toHaveLength(12);
    expect(versions.filter((v) => v.indexingStatus === 'ready')).toHaveLength(11);
    const failed = versions.filter((v) => v.indexingStatus === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.indexingError).toBe("No page has a text layer. OCR isn't supported.");
    const sso = docs.find((d) => d.title === 'SSO setup guide');
    const [ssoV] = await db().select().from(documentVersions).where(eq(documentVersions.documentId, sso!.id));
    expect(ssoV?.indexingWarnings?.join(' ')).toMatch(/page 2/i);
    await runWorker({ once: true });
    const again = await db().select().from(documentVersions);
    expect(again.map((v) => v.indexingStatus).sort()).toEqual(versions.map((v) => v.indexingStatus).sort());
  });

  it('leaves v2 active when v3 fails', async () => {
    const v2 = await queueDocument({
      title: 'Keep v2',
      category: 'Policies',
      effectiveAt: utcToday(),
      filename: 'v2.md',
      bytes: Buffer.from('# V2\nStill good.\n', 'utf8'),
      employeeId: null,
    });
    await processVersion(v2.version.id);
    const [ready] = await db().select().from(documentVersions).where(eq(documentVersions.id, v2.version.id));
    expect(ready?.indexingStatus).toBe('ready');

    const v3 = await queueVersion(v2.document.id, {
      effectiveAt: utcToday(),
      filename: 'v3.pdf',
      bytes: buildPdf(['']),
      employeeId: null,
    });
    await processVersion(v3.version.id);
    const [failed] = await db().select().from(documentVersions).where(eq(documentVersions.id, v3.version.id));
    const [doc] = await db().select().from(documents).where(eq(documents.id, v2.document.id));
    expect(failed?.indexingStatus).toBe('failed');
    expect(failed?.indexingError).toMatch(/text layer/);
    expect(doc?.activeVersionId).toBe(v2.version.id);
  });

  it('does not activate v2 over an active v3', async () => {
    const first = await queueDocument({
      title: 'No downgrade',
      category: 'FAQ',
      effectiveAt: utcToday(),
      filename: 'v2.md',
      bytes: Buffer.from('# Old\nPrevious body.\n', 'utf8'),
      employeeId: null,
    });
    await processVersion(first.version.id);
    const newer = await queueVersion(first.document.id, {
      effectiveAt: utcToday(),
      filename: 'v3.md',
      bytes: Buffer.from('# New\nNewer body.\n', 'utf8'),
      employeeId: null,
    });
    await activateVersion(
      newer.version.id,
      [{ heading: 'New', pageNumber: null, text: 'Newer body.', embedding: unit() }],
      { warnings: [], pageCount: null, model: 'gemini-embedding-2' },
    );
    await activateVersion(
      first.version.id,
      [{ heading: 'Old', pageNumber: null, text: 'Previous body.', embedding: unit() }],
      { warnings: [], pageCount: null, model: 'gemini-embedding-2' },
    );
    const [doc] = await db().select().from(documents).where(eq(documents.id, first.document.id));
    expect(doc?.activeVersionId).toBe(newer.version.id);
  });

  it('never lets two workers claim the same version', async () => {
    await db()
      .update(documentVersions)
      .set({ indexingStatus: 'failed', indexingError: 'held for claim test' })
      .where(eq(documentVersions.indexingStatus, 'queued'));
    const created = await queueDocument({
      title: 'One claim',
      category: 'Plans',
      effectiveAt: utcToday(),
      filename: 'one.md',
      bytes: Buffer.from('# One\nOnly once.\n', 'utf8'),
      employeeId: null,
    });
    const [a, b] = await Promise.all([claimVersion(), claimVersion()]);
    const ids = [a?.id, b?.id].filter((id): id is number => id != null);
    expect(ids.filter((id) => id === created.version.id)).toHaveLength(1);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('replaces leftover chunks on retry so the count matches the new extract', async () => {
    const created = await queueDocument({
      title: 'Retry chunks',
      category: 'Billing',
      effectiveAt: utcToday(),
      filename: 'retry.md',
      bytes: Buffer.from('# Only\nOne passage.\n', 'utf8'),
      employeeId: null,
    });
    await db().insert(documentChunks).values(
      [0, 1, 2].map((chunkIndex) => ({
        versionId: created.version.id,
        chunkIndex,
        heading: 'Old',
        pageNumber: null,
        text: `stale ${chunkIndex}`,
        embedding: unit(),
        embeddingModel: 'gemini-embedding-2',
      })),
    );
    await processVersion(created.version.id);
    const rows = await db().select().from(documentChunks).where(eq(documentChunks.versionId, created.version.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe('One passage.');
  });

  it('marks a stale processing version as failed', async () => {
    const created = await queueDocument({
      title: 'Stale',
      category: 'Security',
      effectiveAt: utcToday(),
      filename: 'stale.md',
      bytes: Buffer.from('# Stale\nHung.\n', 'utf8'),
      employeeId: null,
    });
    await db()
      .update(documentVersions)
      .set({
        indexingStatus: 'processing',
        processingStartedAt: new Date(Date.now() - 11 * 60 * 1000),
      })
      .where(eq(documentVersions.id, created.version.id));
    expect(await failStaleProcessing()).toBeGreaterThanOrEqual(1);
    const [row] = await db().select().from(documentVersions).where(eq(documentVersions.id, created.version.id));
    expect(row?.indexingStatus).toBe('failed');
    expect(row?.indexingError).toBe('Indexing timed out.');
  });

  it('fails the version when the provider returns fewer vectors than chunks', async () => {
    const created = await queueDocument({
      title: 'Incomplete embed',
      category: 'Developer',
      effectiveAt: utcToday(),
      filename: 'short.md',
      bytes: Buffer.from('# A\none\n\n# B\ntwo\n', 'utf8'),
      employeeId: null,
    });
    const stub = stubProvider();
    await processVersion(created.version.id, {
      ...stub,
      embedDocuments: async (chunks, deadline) => {
        const { vectors } = await stub.embedDocuments(chunks, deadline);
        return { vectors: vectors.slice(0, -1) };
      },
    });
    const [row] = await db().select().from(documentVersions).where(eq(documentVersions.id, created.version.id));
    const chunks = await db().select().from(documentChunks).where(eq(documentChunks.versionId, created.version.id));
    expect(row?.indexingStatus).toBe('failed');
    expect(row?.indexingError).toBe('Embedding response was incomplete.');
    expect(chunks).toHaveLength(0);
  });

  it('embeds a document larger than the batch size with one call per batch', async () => {
    const n = EMBED_BATCH_SIZE + 1;
    const created = await queueDocument({
      title: 'Over batch size',
      category: 'Developer',
      effectiveAt: utcToday(),
      filename: 'many.md',
      bytes: Buffer.from(Array.from({ length: n }, (_, i) => `# H${i}\nchunk ${i} unique.\n`).join('\n'), 'utf8'),
      employeeId: null,
    });
    await processVersion(created.version.id);
    const [row] = await db().select().from(documentVersions).where(eq(documentVersions.id, created.version.id));
    const chunks = await db()
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.versionId, created.version.id))
      .orderBy(asc(documentChunks.chunkIndex));
    const calls = await db()
      .select()
      .from(providerCalls)
      .where(and(eq(providerCalls.documentVersionId, created.version.id), eq(providerCalls.kind, 'embed_document')));
    expect(row?.indexingStatus).toBe('ready');
    expect(chunks).toHaveLength(n);
    expect(calls.filter((c) => c.status === 'ok')).toHaveLength(2);
    // Each chunk, including the one in batch 2, stores its own text's vector.
    // pgvector keeps float4, so compare at that precision.
    const expected = await stubProvider().embedDocuments(
      chunks.map((c) => ({ title: c.heading ?? undefined, text: c.text })),
      Date.now() + 60_000,
    );
    chunks.forEach((c, i) => {
      expect(c.embedding.map(Math.fround)).toEqual(expected.vectors[i]!.map(Math.fround));
    });
  });

  it('fails with the budget message when the daily cap is reached', async () => {
    await db().insert(budgetDays).values({ day: utcToday(), spentUsd: '5' }).onConflictDoUpdate({
      target: budgetDays.day,
      set: { spentUsd: '5' },
    });
    const created = await queueDocument({
      title: 'Budget',
      category: 'Developer',
      effectiveAt: utcToday(),
      filename: 'budget.md',
      bytes: Buffer.from('# Pay\nNeeds an embedding.\n', 'utf8'),
      employeeId: null,
    });
    await processVersion(created.version.id);
    const [row] = await db().select().from(documentVersions).where(eq(documentVersions.id, created.version.id));
    expect(row?.indexingStatus).toBe('failed');
    expect(row?.indexingError).toBe('Daily budget reached — retry later');
  });
});
