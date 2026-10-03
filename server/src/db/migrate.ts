import '../env.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { makeDb } from './index.js';

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');

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
