import type { App } from '../app.ts';
import { unauthorized } from '../errors.ts';
import { findSessionEmployee, SESSION_COOKIE } from '../services/auth.service.ts';

const PUBLIC_ROUTES = new Set(['/api/auth/login']);

export function registerAuthHook(app: App): void {
  // Every /api route except login needs a session, including unknown ones,
  // so a missing route never tells an anonymous caller more than a 401.
  // B03: check the route Fastify matched, not the raw URL. The router decodes
  // percent-escapes, so /%61pi/accounts reaches /api/accounts.
  app.addHook('onRequest', async (request) => {
    const path = request.routeOptions.url ?? request.url.split('?')[0]!;
    if (!path.startsWith('/api/') || PUBLIC_ROUTES.has(path)) {
      return;
    }

    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      throw unauthorized();
    }
    const employeeId = await findSessionEmployee(token);
    if (employeeId == null) {
      throw unauthorized();
    }
    request.employeeId = employeeId;
  });
}
