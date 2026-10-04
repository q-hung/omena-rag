import { z } from 'zod';
import type { App } from '../app.ts';
import type { Config } from '../config.ts';
import {
  createConversation,
  regenerateConversation,
  replyConversation,
  type GenerateDeps,
} from '../services/generate.service.ts';
import { editAnswer, reviewConversation } from '../services/review.service.ts';
import { listConversations } from '../services/conversation-list.service.ts';
import { presentConversation } from '../services/conversation-view.service.ts';
import { STATES } from '../state.ts';

const questionBody = z.object({
  accountId: z.number().int().positive(),
  question: z.string().trim().min(1).max(2_000),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });
// Empty and over-long replies are rejected by replyConversation (EMPTY_REPLY, REPLY_TOO_LONG).
const replyBody = z.object({
  selections: z.array(z.string().trim().min(1)).max(4).optional(),
  text: z.string().optional(),
});
const editBody = z.object({ editedText: z.string() });
const reviewBody = z.object({
  answerId: z.number().int().positive(),
  reviewAcknowledged: z.boolean().optional(),
});
const listQuery = z.object({
  accountId: z.coerce.number().int().positive().optional(),
  mine: z.enum(['0', '1']).default('1'),
  state: z.enum(STATES).optional(),
  signal: z.string().optional(),
  topic: z.string().optional(),
});

export function registerConversations(app: App, config: Config, deps: GenerateDeps = {}): void {
  app.post('/api/conversations', { schema: { body: questionBody } }, async (request, reply) => {
    const id = await createConversation({
      accountId: request.body.accountId,
      question: request.body.question,
      employeeId: request.employeeId!,
      config,
      deps,
      log: request.log,
    });
    return reply.status(201).send(await presentConversation(id, request.employeeId!));
  });

  app.post('/api/conversations/:id/regenerate', { schema: { params: idParam } }, async (request) => {
    const id = await regenerateConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      config,
      deps,
      log: request.log,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.post('/api/conversations/:id/replies', { schema: { params: idParam, body: replyBody } }, async (request) => {
    const id = await replyConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      selections: request.body.selections,
      text: request.body.text,
      config,
      deps,
      log: request.log,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.patch('/api/answers/:id', { schema: { params: idParam, body: editBody } }, async (request) => {
    const conversationId = await editAnswer({
      answerId: request.params.id,
      employeeId: request.employeeId!,
      editedText: request.body.editedText,
    });
    return presentConversation(conversationId, request.employeeId!);
  });

  app.post('/api/conversations/:id/review', { schema: { params: idParam, body: reviewBody } }, async (request) => {
    const id = await reviewConversation({
      conversationId: request.params.id,
      employeeId: request.employeeId!,
      answerId: request.body.answerId,
      reviewAcknowledged: request.body.reviewAcknowledged,
    });
    return presentConversation(id, request.employeeId!);
  });

  app.get('/api/conversations/:id', { schema: { params: idParam } }, async (request) => {
    return presentConversation(request.params.id, request.employeeId!);
  });

  app.get('/api/conversations', { schema: { querystring: listQuery } }, async (request) => {
    return listConversations({ ...request.query, employeeId: request.employeeId! });
  });
}
