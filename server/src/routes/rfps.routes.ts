import { z } from 'zod';
import type { App } from '../app.ts';
import type { Config } from '../config/config.ts';
import { regenerateQuestion, type RfpAnswerDeps } from '../services/rfp-answer.service.ts';
import { createRfp, getRfp, listRfps } from '../services/rfp.service.ts';

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
const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  mine: z.enum(['0', '1']).default('1'),
});

export function registerRfps(app: App, config: Config, deps?: RfpAnswerDeps): void {
  app.post('/api/rfps', { schema: { body: createBody } }, async (request, reply) => {
    const rfp = await createRfp({
      title: request.body.title,
      questions: request.body.questions,
      employeeId: request.employeeId!,
    });
    return reply.status(201).send(rfp);
  });

  app.get('/api/rfps', { schema: { querystring: listQuery } }, async (request) => {
    return listRfps({ employeeId: request.employeeId!, mine: request.query.mine });
  });

  app.get('/api/rfps/:id', { schema: { params: idParam } }, async (request) => {
    return getRfp(request.params.id, request.employeeId!);
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
