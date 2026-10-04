import type { App } from '../app.ts';

export function registerRequestLog(app: App): void {
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
}
