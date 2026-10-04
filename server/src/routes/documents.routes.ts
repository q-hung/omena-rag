import { z } from 'zod';
import type { App } from '../app.ts';
import { badRequest } from '../errors.ts';
import {
  get,
  getVersionFile,
  impact,
  indexingBusy,
  list,
  remove,
  retryVersion,
  setArchived,
} from '../services/document.service.ts';
import { parseEffectiveDate, queueDocument, queueVersion } from '../services/document-upload.service.ts';

const CATEGORIES = ['Plans', 'Policies', 'Billing', 'FAQ', 'Security', 'Developer'] as const;

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
    async (request) => list(request.query),
  );

  app.get('/api/documents/indexing-status', async () => indexingBusy());

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

  app.get('/api/documents/:id', { schema: { params: idParam } }, async (request) => get(request.params.id));

  app.delete('/api/documents/:id', { schema: { params: idParam } }, async (request, reply) => {
    await remove(request.params.id);
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

  app.post('/api/documents/:id/archive', { schema: { params: idParam } }, async (request) =>
    setArchived(request.params.id, new Date()),
  );

  app.post('/api/documents/:id/restore', { schema: { params: idParam } }, async (request) =>
    setArchived(request.params.id, null),
  );

  app.post(
    '/api/documents/:id/versions/:vid/retry',
    { schema: { params: versionParams } },
    async (request) => retryVersion(request.params.id, request.params.vid),
  );

  app.get('/api/documents/:id/impact', { schema: { params: idParam } }, async (request) => impact(request.params.id));

  app.get(
    '/api/documents/:id/versions/:vid/file',
    { schema: { params: versionParams } },
    async (request, reply) => {
      const file = await getVersionFile(request.params.id, request.params.vid);
      return reply
        .header('Content-Type', file.mimeType)
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .header('X-Content-Type-Options', 'nosniff')
        .send(file.bytes);
    },
  );
}
