import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { config as loadConfig, type Config } from './config.ts';
import { registerAccounts } from './accounts.ts';
import { registerAuth } from './auth.ts';
import { AppError } from './errors.ts';

export type App = Awaited<ReturnType<typeof buildApp>>;

declare module 'fastify' {
  interface FastifyRequest {
    employeeId?: number;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type BuildOptions = { config?: Config; logger?: FastifyServerOptions['logger'] };

export async function buildApp(options: BuildOptions = {}) {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: options.logger ?? { level: process.env.LOG_LEVEL ?? 'info' },
    // SEC-11: Fastify's own request/response lines would echo query strings and
    // headers. One allow-listed line per request is emitted below instead.
    logController: new LogController({ disableRequestLogging: true }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: { 'default-src': ["'self'"] } },
  });
  await app.register(cookie);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    // SEC-03: a browser always sends Origin on cross-site mutations, so an
    // absent one is treated as untrusted rather than same-origin.
    if (!SAFE_METHODS.has(request.method) && request.headers.origin !== config.APP_ORIGIN) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'This request did not come from the app.');
    }
  });

  registerAuth(app, config);
  registerAccounts(app);

  app.addHook('onResponse', async (request, reply) => {
    // `reqId` is already bound on the request logger.
    request.log.info({
      route: request.routeOptions.url ?? request.url.split('?')[0],
      method: request.method,
      employeeId: request.employeeId,
      status: reply.statusCode,
      latencyMs: Math.round(reply.elapsedTime),
    });
  });

  app.setErrorHandler((raw: unknown, request, reply) => {
    const error = raw as Error & { statusCode?: number; code?: string };
    const { statusCode, code, message } = describe(error);
    if (statusCode >= 500) request.log.error({ code, err: error.message, cause: (error.cause as Error | undefined)?.message });
    else request.log.warn({ code });
    reply.status(statusCode).send({ error: { code, message } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
  });

  return app;
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
