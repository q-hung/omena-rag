import { createHash } from 'node:crypto';
import '../src/config/env.ts';
import { SERVER_ROOT } from '../src/lib/paths.ts';

// Every server test runs against a per-checkout database with the stub provider (§13.3).
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'stub';

// Test files truncate every table, so two checkouts (git worktrees) must not share a database.
// Host and credentials come from TEST_DATABASE_URL; the database name gets a suffix derived
// from this checkout's server folder, e.g. omena_test_1a2b3c4d. globalSetup creates it.
const base = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgres://omena:omena@localhost:5433/omena_test',
);
const suffix = createHash('sha1').update(SERVER_ROOT).digest('hex').slice(0, 8);

export const TEST_DATABASE_NAME = `${base.pathname.slice(1)}_${suffix}`;

// Same server, default maintenance database: where CREATE DATABASE runs.
export const MAINTENANCE_DATABASE_URL = Object.assign(new URL(base), { pathname: '/postgres' }).toString();

base.pathname = `/${TEST_DATABASE_NAME}`;
process.env.DATABASE_URL = base.toString();

export const TEST_DATABASE_URL = process.env.DATABASE_URL;
