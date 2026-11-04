import { Client } from 'pg';
import { MAINTENANCE_DATABASE_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from './env.ts';
import { runMigrations } from '../src/db/migrate.ts';

const DUPLICATE_DATABASE = '42P04';

// The per-checkout database (see env.ts) does not exist on first run. Never dropped here.
async function ensureTestDatabase(): Promise<void> {
  const admin = new Client({ connectionString: MAINTENANCE_DATABASE_URL });
  await admin.connect();
  try {
    const found = await admin.query('select 1 from pg_database where datname = $1', [
      TEST_DATABASE_NAME,
    ]);
    if (found.rowCount === 0) {
      await admin.query(`create database "${TEST_DATABASE_NAME}"`);
    }
  } catch (error) {
    // Another test run in this checkout created it between the check and the create.
    if ((error as { code?: string }).code !== DUPLICATE_DATABASE) {
      throw error;
    }
  } finally {
    await admin.end();
  }
}

export default async function setup() {
  await ensureTestDatabase();
  await runMigrations(TEST_DATABASE_URL);
}
