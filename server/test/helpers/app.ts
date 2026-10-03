import type { InjectOptions } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import type { GenerateDeps } from '../../src/generate.ts';

export const TEST_ORIGIN = 'http://localhost:5173';

/** Captures the log lines the app emits, so tests can assert on SEC-11. */
export class LogCapture {
  readonly lines: Record<string, unknown>[] = [];
  readonly stream = {
    write: (line: string) => {
      this.lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  get text(): string {
    return this.lines.map((l) => JSON.stringify(l)).join('\n');
  }
}

type Routes = (app: Awaited<ReturnType<typeof buildApp>>) => void;

export async function buildTestApp(logs?: LogCapture, routes?: Routes, generate?: GenerateDeps) {
  const config = loadConfig({
    ...process.env,
    APP_ORIGIN: TEST_ORIGIN,
    COOKIE_SECURE: 'false',
  });
  const app = await buildApp({
    config,
    logger: logs ? { level: 'info', stream: logs.stream } : false,
    generate,
  });
  routes?.(app);
  await app.ready();
  return app;
}

/** Mutating injections carry the app Origin, as a browser would (SEC-03). */
export const asBrowser = (options: InjectOptions): InjectOptions => ({
  ...options,
  headers: { origin: TEST_ORIGIN, ...options.headers },
});
