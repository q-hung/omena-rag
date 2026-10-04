import { z } from 'zod';
import type { App } from '../app.ts';
import type { Config } from '../config/config.ts';
import { getEmployee, login, logout, SESSION_COOKIE } from '../services/auth.service.ts';

export function registerAuth(app: App, config: Config): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
  } as const;

  app.post(
    '/api/auth/login',
    {
      schema: {
        body: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }),
      },
    },
    async (request, reply) => {
      const result = await login(config, {
        email: request.body.email,
        password: request.body.password,
        ip: request.ip,
      });
      request.employeeId = result.employee.id;
      reply.setCookie(SESSION_COOKIE, result.token, { ...cookieOptions, expires: result.expiresAt });
      return { employee: result.employee };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    await logout(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get('/api/me', async (request) => {
    const employee = await getEmployee(request.employeeId!);
    return { employee, simulated: config.LLM_PROVIDER === 'stub' };
  });
}
