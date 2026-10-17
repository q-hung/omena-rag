import { z } from 'zod';
import type { App } from '../app.ts';
import type { Config } from '../config/config.ts';
import { regenerateQuestion, type RfpAnswerDeps } from '../services/rfp-answer.service.ts';
import { badRequest } from '../errors.ts';
import { editRfpAnswer, reviewRfpAnswer } from '../services/rfp-review.service.ts';
import { queueQuestions } from '../services/rfp-queue.service.ts';
import { confirmRfp, createRfp, createRfpFromSource, getRfp, listRfps, reextract, replaceQuestions } from '../services/rfp.service.ts';

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(2_000),
        section: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
});
const questionItem = z.object({
  text: z.string().trim().min(1).max(2_000),
  section: z.string().trim().max(200).nullish().transform((v) => v || undefined),
});
const textBody = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(300_000),
});
const putBody = z.object({ questions: z.array(questionItem).max(50) });
const extractBody = z.object({ text: z.string().min(1).max(300_000).optional() }).nullish();
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw badRequest('VALIDATION_FAILED', 'The request body is invalid.');
  }
  return r.data;
}
const editBody = z.object({ editedText: z.string().max(20_000) });
const reviewBody = z.object({
  verdict: z.enum(['accepted', 'needs_work', 'wrong_evidence']),
  note: z.string().max(1_000).optional(),
  flaggedCitations: z.array(z.number().int().positive()).max(50).optional(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  mine: z.enum(['0', '1']).default('1'),
});

export function registerRfps(app: App, config: Config, deps?: RfpAnswerDeps): void {
  // One URL, three shapes: JSON {title, questions} (confirmed), JSON {title, text}, multipart {title, file}.
  app.post('/api/rfps', async (request, reply) => {
    const employeeId = request.employeeId!;
    if (request.isMultipart()) {
      let title = '';
      let file: { filename: string; bytes: Buffer } | undefined;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          file = { filename: part.filename || 'upload.bin', bytes: await part.toBuffer() };
        } else if (part.fieldname === 'title') {
          title = String(part.value ?? '').trim();
        }
      }
      if (!title || title.length > 200) {
        throw badRequest('VALIDATION_FAILED', 'Enter a title of up to 200 characters.');
      }
      if (!file) {
        throw badRequest('MISSING_FILE', 'A file is required.');
      }
      return reply.status(201).send(await createRfpFromSource({ title, file, employeeId }));
    }
    const body = request.body as { questions?: unknown } | undefined;
    if (body && 'questions' in body) {
      const parsed = parse(createBody, body);
      return reply.status(201).send(await createRfp({ ...parsed, employeeId }));
    }
    const parsed = parse(textBody, body);
    return reply.status(201).send(await createRfpFromSource({ ...parsed, employeeId }));
  });

  app.put(
    '/api/rfps/:id/questions',
    { schema: { params: idParam, body: putBody } },
    async (request) => replaceQuestions(request.params.id, request.employeeId!, request.body.questions),
  );
  app.post('/api/rfps/:id/confirm', { schema: { params: idParam } }, async (request) =>
    confirmRfp(request.params.id, request.employeeId!),
  );
  app.post(
    '/api/rfps/:id/generate',
    { schema: { params: idParam, querystring: z.object({ force: z.enum(['0', '1']).default('0') }) } },
    async (request) => queueQuestions(request.params.id, request.employeeId!, request.query.force === '1'),
  );
  app.post('/api/rfps/:id/extract', { schema: { params: idParam, body: extractBody } }, async (request) =>
    reextract(request.params.id, request.employeeId!, request.body?.text),
  );

  app.get('/api/rfps', { schema: { querystring: listQuery } }, async (request) => {
    return listRfps({ employeeId: request.employeeId!, mine: request.query.mine });
  });

  app.get('/api/rfps/:id', { schema: { params: idParam } }, async (request) => {
    return getRfp(request.params.id, request.employeeId!);
  });

  app.patch('/api/rfp-answers/:id', { schema: { params: idParam, body: editBody } }, async (request) => {
    const rfpId = await editRfpAnswer({
      answerId: request.params.id,
      employeeId: request.employeeId!,
      editedText: request.body.editedText,
    });
    return getRfp(rfpId, request.employeeId!);
  });

  app.post('/api/rfp-answers/:id/reviews', { schema: { params: idParam, body: reviewBody } }, async (request, reply) => {
    const rfpId = await reviewRfpAnswer({
      answerId: request.params.id,
      employeeId: request.employeeId!,
      ...request.body,
    });
    return reply.status(201).send(await getRfp(rfpId, request.employeeId!));
  });

  app.post('/api/rfp-questions/:id/regenerate', { schema: { params: idParam } }, async (request) => {
    const rfpId = await regenerateQuestion({
      questionId: request.params.id,
      employeeId: request.employeeId!,
      config,
      deps,
      log: request.log,
    });
    return getRfp(rfpId, request.employeeId!);
  });
}
