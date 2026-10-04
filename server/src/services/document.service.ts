import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { rowsOf } from '../db/rows.ts';
import {
  answerSources,
  answers,
  documentChunks,
  documentFiles,
  documentVersions,
  documents,
  employees,
  reviewedAnswers,
} from '../db/schema.ts';
import { conflict, notFound } from '../errors.ts';

// Routes validate against this but may not import db/ (M10).
export { CATEGORIES } from '../db/schema.ts';

function likePattern(term: string): string {
  return `%${term.replace(/[%_\\]/g, '\\$&')}%`;
}

export async function list(input: { q?: string; category?: string; archived?: '0' | '1' }) {
  const { q, category, archived } = input;
  const term = q?.trim();
  const rows = await db().execute(sql`
    select
      d.id, d.title, d.category, d.archived_at,
      av.id as av_id, av.version_number as av_n, av.effective_at as av_eff,
      av.created_at as av_up, av.indexing_warnings as av_warn,
      lv.id as lv_id, lv.version_number as lv_n, lv.indexing_status as lv_status,
      lv.indexing_error as lv_error
    from documents d
    left join document_versions av on av.id = d.active_version_id
    left join document_versions lv on lv.id = (
      select v.id from document_versions v
      where v.document_id = d.id
      order by v.version_number desc
      limit 1
    )
    where (${archived === '1'} or d.archived_at is null)
      and (${category ?? null}::text is null or d.category = ${category ?? null})
      and (
        ${term ?? null}::text is null
        or d.title ilike ${likePattern(term ?? '')} escape '\'
        or exists (
          select 1 from document_chunks c
          where c.version_id = d.active_version_id
            and c.text ilike ${likePattern(term ?? '')} escape '\'
        )
      )
    order by d.title
  `);

  return {
    documents: rowsOf(rows).map((r) => ({
      id: Number(r.id),
      title: r.title,
      category: r.category,
      archivedAt: r.archived_at,
      activeVersion: r.av_id
        ? {
            id: Number(r.av_id),
            versionNumber: Number(r.av_n),
            effectiveAt: r.av_eff,
            uploadedAt: r.av_up,
            warnings: r.av_warn ?? [],
          }
        : null,
      latest: r.lv_id
        ? {
            id: Number(r.lv_id),
            versionNumber: Number(r.lv_n),
            status: r.lv_status,
            error: r.lv_error,
          }
        : null,
    })),
  };
}

export async function indexingBusy() {
  const [row] = await db()
    .select({
      n: sql<number>`count(*) filter (where ${documentVersions.indexingStatus} in ('queued', 'processing'))::int`,
    })
    .from(documentVersions);
  return { busy: (row?.n ?? 0) > 0 };
}

export async function get(id: number) {
  const [doc] = await db().select().from(documents).where(eq(documents.id, id));
  if (!doc) {
    throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
  }

  const versions = await db()
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id))
    .orderBy(desc(documentVersions.versionNumber));
  const uploaders = await db().select({ id: employees.id, name: employees.name }).from(employees);
  const names = new Map(uploaders.map((e) => [e.id, e.name]));

  const payload = [];
  for (const version of versions) {
    const chunks = await db()
      .select({
        chunkIndex: documentChunks.chunkIndex,
        heading: documentChunks.heading,
        pageNumber: documentChunks.pageNumber,
        text: documentChunks.text,
      })
      .from(documentChunks)
      .where(eq(documentChunks.versionId, version.id))
      .orderBy(asc(documentChunks.chunkIndex));
    payload.push({
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.indexingStatus,
      effectiveAt: version.effectiveAt,
      changeNote: version.changeNote,
      uploadedAt: version.createdAt,
      uploadedBy: version.uploadedBy ? names.get(version.uploadedBy) ?? null : null,
      originalFilename: version.originalFilename,
      mimeType: version.mimeType,
      pageCount: version.pageCount,
      error: version.indexingError,
      warnings: version.indexingWarnings ?? [],
      chunks,
    });
  }

  const latest = payload[0] ?? null;
  const active = payload.find((v) => v.id === doc.activeVersionId) ?? null;
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    archivedAt: doc.archivedAt,
    activeVersionId: doc.activeVersionId,
    activeVersionNumber: active?.versionNumber ?? null,
    versions: payload,
    latest: latest
      ? { id: latest.id, versionNumber: latest.versionNumber, status: latest.status, error: latest.error }
      : null,
    activeVersion: active
      ? {
          id: active.id,
          versionNumber: active.versionNumber,
          effectiveAt: active.effectiveAt,
          uploadedAt: active.uploadedAt,
          warnings: active.warnings,
        }
      : null,
  };
}

export async function remove(id: number) {
  await db().transaction(async (tx) => {
    const locked = rowsOf(await tx.execute(sql`select id from documents where id = ${id} for update`));
    if (!locked.length) {
      throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
    }
    await tx.update(documents).set({ activeVersionId: null }).where(eq(documents.id, id));
    await tx.delete(documents).where(eq(documents.id, id));
  });
}

export async function setArchived(id: number, archivedAt: Date | null) {
  return db().transaction(async (tx) => {
    const locked = rowsOf(await tx.execute(sql`select id from documents where id = ${id} for update`));
    if (!locked.length) {
      throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
    }
    const [doc] = await tx.update(documents).set({ archivedAt }).where(eq(documents.id, id)).returning();
    return { id: doc!.id, archivedAt: doc!.archivedAt };
  });
}

export async function retryVersion(id: number, vid: number) {
  return db().transaction(async (tx) => {
    const locked = rowsOf(await tx.execute(sql`select id from documents where id = ${id} for update`));
    if (!locked.length) {
      throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
    }
    const versions = await tx
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.versionNumber));
    const latest = versions[0];
    if (!latest) {
      throw notFound('VERSION_NOT_FOUND', 'No such version.');
    }
    if (latest.id !== vid) {
      throw conflict('NOT_LATEST', 'Only the latest version can be retried.');
    }
    if (latest.indexingStatus !== 'failed') {
      throw conflict('NOT_FAILED', 'Only a failed version can be retried.');
    }
    const [version] = await tx
      .update(documentVersions)
      .set({ indexingStatus: 'queued', indexingError: null, processingStartedAt: null })
      .where(eq(documentVersions.id, vid))
      .returning();
    return { version: { id: version!.id, versionNumber: version!.versionNumber, indexingStatus: 'queued' as const } };
  });
}

export async function impact(id: number) {
  const [doc] = await db().select({ id: documents.id }).from(documents).where(eq(documents.id, id));
  if (!doc) {
    throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
  }

  const [unsaved] = await db()
    .select({ n: sql<number>`count(distinct ${answers.id})::int` })
    .from(answers)
    .innerJoin(answerSources, eq(answerSources.answerId, answers.id))
    .innerJoin(documentChunks, eq(documentChunks.id, answerSources.chunkId))
    .innerJoin(documentVersions, eq(documentVersions.id, documentChunks.versionId))
    .where(
      and(
        eq(documentVersions.documentId, id),
        sql`not exists (select 1 from reviewed_answers r where r.conversation_id = ${answers.conversationId})`,
      ),
    );

  const [saved] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewedAnswers)
    .where(
      sql`exists (
        select 1 from jsonb_array_elements(${reviewedAnswers.sources}) s
        where (s->>'document_id')::bigint = ${id}
      )`,
    );

  return { unsaved: unsaved?.n ?? 0, saved: saved?.n ?? 0 };
}

export async function getVersionFile(id: number, vid: number) {
  const [version] = await db()
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.id, vid), eq(documentVersions.documentId, id)));
  if (!version) {
    throw notFound('VERSION_NOT_FOUND', 'No such version.');
  }
  const [file] = await db().select().from(documentFiles).where(eq(documentFiles.versionId, vid));
  if (!file) {
    throw notFound('FILE_NOT_FOUND', 'The original file is no longer available.');
  }
  return {
    bytes: file.bytes,
    mimeType: version.mimeType,
    filename: version.originalFilename.replace(/["\r\n]/g, '_'),
  };
}
