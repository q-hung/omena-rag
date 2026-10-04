import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Entrypoints import this first so `.env` at the repo root reaches process.env.
const file = resolve(import.meta.dirname, '../../../.env');
if (existsSync(file)) process.loadEnvFile(file);
