import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { App } from '../app.ts';
import { AppError } from '../errors.ts';

export async function registerErrors(app: App): Promise<void> {
  const spa = process.env.STATIC_DIR && existsSync(join(process.env.STATIC_DIR, 'index.html')) ? process.env.STATIC_DIR : null;

  app.setErrorHandler((raw: unknown, request, reply) => {
    const error = raw as Error & { statusCode?: number; code?: string };
    const { statusCode, code, message } = describe(error);
    if (statusCode >= 500) request.log.error({ code, err: error.message, cause: (error.cause as Error | undefined)?.message });
    else request.log.warn({ code });
    const conversationId = raw instanceof AppError ? raw.conversationId : undefined;
    reply.status(statusCode).send({
      error: { code, message },
      ...(conversationId != null ? { conversationId } : {}),
    });
  });

  // B06: set the handler before the awaited register below. That register boots
  // the queue, and routes already declared keep whichever handler is set then.
  if (spa) {
    await app.register(fastifyStatic, { root: spa, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    if (spa && (request.method === 'GET' || request.method === 'HEAD') && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
  });
}

function describe(error: Error & { statusCode?: number; code?: string }) {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, code: error.code, message: error.message };
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    return { statusCode: 400, code: 'VALIDATION_FAILED', message: 'The request body is invalid.' };
  }
  if (error.statusCode === 413) {
    return { statusCode: 413, code: 'FILE_TOO_LARGE', message: 'Files must be 3 MB or smaller.' };
  }
  if (error.statusCode && error.statusCode < 500) {
    return { statusCode: error.statusCode, code: error.code ?? 'BAD_REQUEST', message: error.message };
  }
  return { statusCode: 500, code: 'INTERNAL', message: 'Something went wrong.' };
}
