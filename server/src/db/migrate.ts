import '../config/env.ts';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { SERVER_ROOT } from '../lib/paths.ts';
import { makeDb } from './index.ts';

const migrationsFolder = join(SERVER_ROOT, 'drizzle');

export async function runMigrations(connectionString: string): Promise<void> {
  const { pool, db } = makeDb(connectionString);
  try {
    await db.execute(sql`create extension if not exists vector`);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  await runMigrations(url);
  console.log('Migrations applied.');
}
