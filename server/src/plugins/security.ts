import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import type { App } from '../app.ts';
import type { Config } from '../config/config.ts';
import { AppError } from '../errors.ts';
import { FILE_SIZE_LIMIT } from '../services/document-upload.service.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function registerSecurity(app: App, config: Config): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: { 'default-src': ["'self'"] } },
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: FILE_SIZE_LIMIT, files: 1 } });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    // SEC-03: a browser always sends Origin on cross-site mutations, so an
    // absent one is treated as untrusted rather than same-origin.
    if (!SAFE_METHODS.has(request.method) && request.headers.origin !== config.APP_ORIGIN) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'This request did not come from the app.');
    }
  });
}
