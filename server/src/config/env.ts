import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SERVER_ROOT } from '../lib/paths.ts';

// Entrypoints import this first so `.env` at the repo root reaches process.env.
const file = resolve(SERVER_ROOT, '../.env');
if (existsSync(file)) {
  process.loadEnvFile(file);
}
