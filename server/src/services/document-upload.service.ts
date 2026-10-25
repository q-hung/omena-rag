import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { and, eq, inArray, max } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { CATEGORIES, documentFiles, documentVersions, documents } from '../db/schema.ts';
import { badRequest, conflict, notFound } from '../errors.ts';
import { utcToday } from '../lib/format.ts';

export const FILE_SIZE_LIMIT = 3 * 1024 * 1024;
export const MD_CHAR_LIMIT = 300_000;

export function contentHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function inspectFile(filename: string, bytes: Buffer): { mimeType: string } {
  const ext = extname(filename).toLowerCase();
  if (ext === '.pdf') {
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw badRequest('INVALID_FILE', 'PDF files must start with %PDF-.');
    }
    return { mimeType: 'application/pdf' };
  }
  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    const label = ext === '.txt' ? 'Text files' : 'Markdown';
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw badRequest('INVALID_FILE', `${label} must be valid UTF-8.`);
    }
    if (text.includes('\0')) {
      throw badRequest('INVALID_FILE', `${label} cannot contain NUL bytes.`);
    }
    if (text.length > MD_CHAR_LIMIT) {
      throw badRequest('INVALID_FILE', `${label} cannot exceed ${MD_CHAR_LIMIT.toLocaleString()} characters.`);
    }
    return { mimeType: ext === '.txt' ? 'text/plain' : 'text/markdown' };
  }
  throw badRequest('INVALID_FILE', 'Only PDF, Markdown and text files are accepted.');
}

export function parseEffectiveDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest('INVALID_DATE', 'Provide an effective date as YYYY-MM-DD.');
  }
  if (value > utcToday()) {
    throw badRequest('INVALID_DATE', 'The effective date must be today or earlier.');
  }
  return value;
}

export type QueueInput = {
  title?: string;
  category?: string;
  effectiveAt: string;
  note?: string | null;
  filename: string;
  bytes: Buffer;
  employeeId: number | null;
};

export async function queueDocument(input: QueueInput & { title: string; category: string }) {
  if (!input.title.trim()) {
    throw badRequest('INVALID_TITLE', 'Enter a title.');
  }
  if (!(CATEGORIES as readonly string[]).includes(input.category)) {
    throw badRequest('INVALID_CATEGORY', 'Choose a valid category.');
  }
  const { mimeType } = inspectFile(input.filename, input.bytes);
  const hash = contentHash(input.bytes);
  return db().transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        title: input.title.trim(),
        category: input.category,
        createdBy: input.employeeId,
      })
      .returning();
    const [version] = await tx
      .insert(documentVersions)
      .values({
        documentId: doc!.id,
        versionNumber: 1,
        originalFilename: input.filename,
        mimeType,
        sizeBytes: input.bytes.length,
        contentHash: hash,
        effectiveAt: input.effectiveAt,
        changeNote: input.note || null,
        indexingStatus: 'queued',
        uploadedBy: input.employeeId,
      })
      .returning();
    await tx.insert(documentFiles).values({ versionId: version!.id, bytes: input.bytes });
    return { document: doc!, version: version! };
  });
}

export async function queueVersion(documentId: number, input: QueueInput) {
  const { mimeType } = inspectFile(input.filename, input.bytes);
  const hash = contentHash(input.bytes);
  return db().transaction(async (tx) => {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) {
      throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
    }

    const inflight = await tx
      .select({ id: documentVersions.id })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId),
          inArray(documentVersions.indexingStatus, ['queued', 'processing']),
        ),
      );
    if (inflight.length) {
      throw conflict('INDEXING_IN_PROGRESS', 'Another version of this document is already being indexed.');
    }

    if (doc.activeVersionId) {
      const [active] = await tx
        .select({ contentHash: documentVersions.contentHash })
        .from(documentVersions)
        .where(eq(documentVersions.id, doc.activeVersionId));
      if (active?.contentHash === hash) {
        throw conflict('DUPLICATE_HASH', 'This file is identical to the active version.');
      }
    }

    const [agg] = await tx
      .select({ n: max(documentVersions.versionNumber) })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId));
    const versionNumber = (agg?.n ?? 0) + 1;
    const [version] = await tx
      .insert(documentVersions)
      .values({
        documentId,
        versionNumber,
        originalFilename: input.filename,
        mimeType,
        sizeBytes: input.bytes.length,
        contentHash: hash,
        effectiveAt: input.effectiveAt,
        changeNote: input.note || null,
        indexingStatus: 'queued',
        uploadedBy: input.employeeId,
      })
      .returning();
    await tx.insert(documentFiles).values({ versionId: version!.id, bytes: input.bytes });
    return { document: doc, version: version! };
  });
}
