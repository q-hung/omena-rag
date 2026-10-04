import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from './app.ts';
import { db } from './db/index.ts';
import {
  CATEGORIES,
  answerSources,
  answers,
  documentChunks,
  documentFiles,
  documentVersions,
  documents,
  employees,
  reviewedAnswers,
} from './db/schema.ts';
import { badRequest, conflict, notFound } from './errors.ts';
import { rowsOf } from './db/rows.ts';
import { parseEffectiveDate, queueDocument, queueVersion } from './upload.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const versionParams = z.object({
  id: z.coerce.number().int().positive(),
  vid: z.coerce.number().int().positive(),
});

async function readMultipart(request: { parts: () => AsyncIterable<unknown> }) {
  const fields: Record<string, string> = {};
  let file: { filename: string; bytes: Buffer } | undefined;
  for await (const raw of request.parts()) {
    const part = raw as {
      type: string;
      filename?: string;
      fieldname: string;
      value?: unknown;
      toBuffer?: () => Promise<Buffer>;
    };
    if (part.type === 'file' && part.toBuffer) {
      file = { filename: part.filename || 'upload.bin', bytes: await part.toBuffer() };
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  if (!file) throw badRequest('MISSING_FILE', 'A file is required.');
  return { file, fields };
}

function likePattern(term: string): string {
  return `%${term.replace(/[%_\\]/g, '\\$&')}%`;
}

export function registerDocuments(app: App): void {
  app.get(
    '/api/documents',
    {
      schema: {
        querystring: z.object({
          q: z.string().optional(),
          category: z.enum(CATEGORIES).optional(),
          archived: z.enum(['0', '1']).optional(),
        }),
      },
    },
    async (request) => {
      const { q, category, archived } = request.query;
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
    },
  );

  app.get('/api/documents/indexing-status', async () => {
    const [row] = await db()
      .select({
        n: sql<number>`count(*) filter (where ${documentVersions.indexingStatus} in ('queued', 'processing'))::int`,
      })
      .from(documentVersions);
    return { busy: (row?.n ?? 0) > 0 };
  });

  app.post('/api/documents', async (request, reply) => {
    const { file, fields } = await readMultipart(request);
    const created = await queueDocument({
      title: fields.title ?? '',
      category: fields.category ?? '',
      effectiveAt: parseEffectiveDate(fields.effectiveDate),
      note: fields.note,
      filename: file.filename,
      bytes: file.bytes,
      employeeId: request.employeeId ?? null,
    });
    return reply.status(201).send({
      document: { id: created.document.id, title: created.document.title, category: created.document.category },
      version: {
        id: created.version.id,
        versionNumber: created.version.versionNumber,
        indexingStatus: created.version.indexingStatus,
      },
    });
  });

  app.get('/api/documents/:id', { schema: { params: idParam } }, async (request) => {
    const id = request.params.id;
    const [doc] = await db().select().from(documents).where(eq(documents.id, id));
    if (!doc) throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');

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
  });

  app.delete('/api/documents/:id', { schema: { params: idParam } }, async (request, reply) => {
    const id = request.params.id;
    await db().transaction(async (tx) => {
      const locked = rowsOf(
        await tx.execute(sql`select id from documents where id = ${id} for update`),
      );
      if (!locked.length) throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
      await tx.update(documents).set({ activeVersionId: null }).where(eq(documents.id, id));
      await tx.delete(documents).where(eq(documents.id, id));
    });
    return reply.status(204).send();
  });

  app.post('/api/documents/:id/versions', { schema: { params: idParam } }, async (request, reply) => {
    const { file, fields } = await readMultipart(request);
    const created = await queueVersion(request.params.id, {
      effectiveAt: parseEffectiveDate(fields.effectiveDate),
      note: fields.note,
      filename: file.filename,
      bytes: file.bytes,
      employeeId: request.employeeId ?? null,
    });
    return reply.status(201).send({
      document: { id: created.document.id, title: created.document.title, category: created.document.category },
      version: {
        id: created.version.id,
        versionNumber: created.version.versionNumber,
        indexingStatus: created.version.indexingStatus,
      },
    });
  });

  app.post('/api/documents/:id/archive', { schema: { params: idParam } }, async (request) => {
    return setArchived(request.params.id, new Date());
  });

  app.post('/api/documents/:id/restore', { schema: { params: idParam } }, async (request) => {
    return setArchived(request.params.id, null);
  });

  app.post(
    '/api/documents/:id/versions/:vid/retry',
    { schema: { params: versionParams } },
    async (request) => {
      const { id, vid } = request.params;
      return db().transaction(async (tx) => {
        const locked = rowsOf(
          await tx.execute(sql`select id from documents where id = ${id} for update`),
        );
        if (!locked.length) throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
        const versions = await tx
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.documentId, id))
          .orderBy(desc(documentVersions.versionNumber));
        const latest = versions[0];
        if (!latest) throw notFound('VERSION_NOT_FOUND', 'No such version.');
        if (latest.id !== vid) {
          throw conflict('NOT_LATEST', 'Only the latest version can be retried.');
        }
        if (latest.indexingStatus !== 'failed') {
          throw conflict('NOT_FAILED', 'Only a failed version can be retried.');
        }
        const [version] = await tx
          .update(documentVersions)
          .set({
            indexingStatus: 'queued',
            indexingError: null,
            processingStartedAt: null,
          })
          .where(eq(documentVersions.id, vid))
          .returning();
        return { version: { id: version!.id, versionNumber: version!.versionNumber, indexingStatus: 'queued' } };
      });
    },
  );

  app.get('/api/documents/:id/impact', { schema: { params: idParam } }, async (request) => {
    const id = request.params.id;
    const [doc] = await db().select({ id: documents.id }).from(documents).where(eq(documents.id, id));
    if (!doc) throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');

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
  });

  app.get(
    '/api/documents/:id/versions/:vid/file',
    { schema: { params: versionParams } },
    async (request, reply) => {
      const { id, vid } = request.params;
      const [version] = await db()
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.id, vid), eq(documentVersions.documentId, id)));
      if (!version) throw notFound('VERSION_NOT_FOUND', 'No such version.');
      const [file] = await db().select().from(documentFiles).where(eq(documentFiles.versionId, vid));
      if (!file) throw notFound('FILE_NOT_FOUND', 'The original file is no longer available.');
      const filename = version.originalFilename.replace(/["\r\n]/g, '_');
      return reply
        .header('Content-Type', version.mimeType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('X-Content-Type-Options', 'nosniff')
        .send(file.bytes);
    },
  );
}

async function setArchived(id: number, archivedAt: Date | null) {
  return db().transaction(async (tx) => {
    const locked = rowsOf(await tx.execute(sql`select id from documents where id = ${id} for update`));
    if (!locked.length) throw notFound('DOCUMENT_NOT_FOUND', 'No such document.');
    const [doc] = await tx.update(documents).set({ archivedAt }).where(eq(documents.id, id)).returning();
    return { id: doc!.id, archivedAt: doc!.archivedAt };
  });
}
