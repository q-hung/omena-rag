import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export function makeDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { pool, db: drizzle(pool, { schema }) };
}

export type Db = ReturnType<typeof makeDb>['db'];

let shared: { pool: Pool; db: Db } | undefined;

function shared_() {
  shared ??= makeDb(process.env.DATABASE_URL ?? '');
  return shared;
}

export const db = (): Db => shared_().db;
export const pool = (): Pool => shared_().pool;

export async function closeDb(): Promise<void> {
  if (shared) {
    await shared.pool.end();
    shared = undefined;
  }
}
