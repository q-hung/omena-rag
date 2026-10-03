import { TEST_DATABASE_URL } from './env.ts';
import { runMigrations } from '../src/db/migrate.ts';

export default async function setup() {
  await runMigrations(TEST_DATABASE_URL);
}
