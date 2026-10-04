import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { registerAccounts } from './routes/accounts.routes.ts';
import { registerAuth } from './auth.ts';
import { config as loadConfig, type Config } from './config.ts';
import { registerConversations } from './conversations.ts';
import { registerDocuments } from './documents.ts';
import type { GenerateDeps } from './generate.ts';
import { registerErrors } from './plugins/errors.ts';
import { registerRequestLog } from './plugins/request-log.ts';
import { registerSecurity } from './plugins/security.ts';

export type App = Awaited<ReturnType<typeof buildApp>>;
export type BuildOptions = {
  config?: Config;
  logger?: FastifyServerOptions['logger'];
  generate?: GenerateDeps;
};

declare module 'fastify' {
  interface FastifyRequest {
    employeeId?: number;
  }
}

export async function buildApp(options: BuildOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    genReqId: () => randomUUID(),
    bodyLimit: 4 * 1024 * 1024,
    logger: options.logger ?? { level: process.env.LOG_LEVEL ?? 'info' },
    logController: new LogController({ disableRequestLogging: true }),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await registerSecurity(app, config);
  registerAuth(app, config);
  registerAccounts(app);
  registerDocuments(app);
  registerConversations(app, config, options.generate ?? {});
  registerRequestLog(app);
  await registerErrors(app);
  return app;
}
