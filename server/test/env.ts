import '../src/config/env.ts';

// Every server test runs against jarvis_test with the stub provider (§13.3).
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'stub';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://jarvis:jarvis@localhost:5433/jarvis_test';

export const TEST_DATABASE_URL = process.env.DATABASE_URL;
