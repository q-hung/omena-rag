import { eq, sql } from 'drizzle-orm';
import { chunk } from './chunk.ts';
import { config as loadConfig } from './config.ts';
import { db } from './db/index.ts';
import { documentChunks, documentFiles, documentVersions, documents } from './db/schema.ts';
import { AppError } from './errors.ts';
import { extract } from './extract.ts';
import { paidAttempt, sweepAbandonedReservations } from './llm/budget.ts';
import { createProvider } from './llm/provider.ts';
import { rowsOf } from './upload.ts';

const STALE_MS = 10 * 60 * 1000;
const BUDGET_FAIL = 'Daily budget reached — retry later';

export async function claimVersion() {
  return db().transaction(async (tx) => {
    const found = rowsOf(
      await tx.execute(sql`
        select id from document_versions
        where indexing_status = 'queued'
        order by id
        for update skip locked
        limit 1
      `),
    );
    const id = found[0]?.id;
    if (id == null) return null;
    const [row] = await tx
      .update(documentVersions)
      .set({ indexingStatus: 'processing', processingStartedAt: new Date(), indexingError: null })
      .where(eq(documentVersions.id, Number(id)))
      .returning();
    return row ?? null;
  });
}

export async function failStaleProcessing(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - STALE_MS);
  const rows = await db()
    .update(documentVersions)
    .set({
      indexingStatus: 'failed',
      indexingError: 'Indexing timed out.',
    })
    .where(
      sql`${documentVersions.indexingStatus} = 'processing'
        and ${documentVersions.processingStartedAt} is not null
        and ${documentVersions.processingStartedAt} < ${cutoff}`,
    )
    .returning({ id: documentVersions.id });
  return rows.length;
}

export async function activateVersion(
  versionId: number,
  chunks: { heading: string | null; pageNumber: number | null; text: string; embedding: number[] }[],
  extras: { warnings: string[]; pageCount: number | null; model: string },
): Promise<void> {
  const [version] = await db().select().from(documentVersions).where(eq(documentVersions.id, versionId));
  if (!version) throw new Error('Version disappeared during activation.');

  await db().transaction(async (tx) => {
    await tx.execute(sql`select id from documents where id = ${version.documentId} for update`);
    await tx.delete(documentChunks).where(eq(documentChunks.versionId, versionId));
    if (chunks.length) {
      await tx.insert(documentChunks).values(
        chunks.map((c, chunkIndex) => ({
          versionId,
          chunkIndex,
          heading: c.heading,
          pageNumber: c.pageNumber,
          text: c.text,
          embedding: c.embedding,
          embeddingModel: extras.model,
        })),
      );
    }
    await tx
      .update(documentVersions)
      .set({
        indexingStatus: 'ready',
        indexingError: null,
        indexingWarnings: extras.warnings,
        pageCount: extras.pageCount,
        indexedAt: new Date(),
      })
      .where(eq(documentVersions.id, versionId));

    const [doc] = await tx.select().from(documents).where(eq(documents.id, version.documentId));
    let activate = true;
    if (doc?.activeVersionId) {
      const [active] = await tx
        .select({ versionNumber: documentVersions.versionNumber })
        .from(documentVersions)
        .where(eq(documentVersions.id, doc.activeVersionId));
      if (active && active.versionNumber >= version.versionNumber) activate = false;
    }
    if (activate) {
      await tx
        .update(documents)
        .set({ activeVersionId: versionId })
        .where(eq(documents.id, version.documentId));
    }
  });
}

function failMessage(error: unknown): string {
  if (error instanceof AppError && error.code === 'budget_reached') return BUDGET_FAIL;
  if (error instanceof Error && error.message && !/\n/.test(error.message) && error.message.length < 200) {
    return error.message;
  }
  return 'Indexing failed.';
}

export async function processVersion(versionId: number): Promise<void> {
  const cfg = loadConfig();
  try {
    const [version] = await db().select().from(documentVersions).where(eq(documentVersions.id, versionId));
    if (!version) return;
    const [file] = await db().select().from(documentFiles).where(eq(documentFiles.versionId, versionId));
    if (!file) throw new Error('The original file is missing.');

    await db().delete(documentChunks).where(eq(documentChunks.versionId, versionId));

    const extracted = await extract(file.bytes, version.originalFilename);
    const pieces = chunk(extracted);
    if (!pieces.length) throw new Error('The document has no extractable text.');

    const provider = createProvider(cfg);
    const inputChars = pieces.reduce((n, p) => n + p.text.length, 0);
    const embedded = await paidAttempt(
      {
        kind: 'embed_document',
        purpose: 'indexing',
        attempt: 1,
        model: cfg.EMBEDDING_MODEL,
        inputChars,
        documentVersionId: versionId,
      },
      async () => ({
        value: await provider.embedDocuments(
          pieces.map((p) => ({ title: p.heading ?? undefined, text: p.text })),
          Date.now() + 60_000,
        ),
      }),
      cfg,
    );

    await activateVersion(
      versionId,
      pieces.map((p, i) => ({
        ...p,
        embedding: embedded.vectors[i] ?? embedded.vectors[0]!,
      })),
      {
        warnings: extracted.warnings,
        pageCount: extracted.kind === 'pdf' ? extracted.pageCount : null,
        model: cfg.EMBEDDING_MODEL,
      },
    );
  } catch (error) {
    await db()
      .update(documentVersions)
      .set({ indexingStatus: 'failed', indexingError: failMessage(error) })
      .where(eq(documentVersions.id, versionId));
  }
}

export async function runWorker(options: { once?: boolean; intervalMs?: number } = {}): Promise<void> {
  const once = options.once ?? process.argv.includes('--once');
  const intervalMs = options.intervalMs ?? 2_000;
  for (;;) {
    await sweepAbandonedReservations();
    await failStaleProcessing();
    const claimed = await claimVersion();
    if (claimed) {
      await processVersion(claimed.id);
      continue;
    }
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('worker.ts') || entry.endsWith('worker.js')) {
  await import('./env.ts');
  runWorker().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
