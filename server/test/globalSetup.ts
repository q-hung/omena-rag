import { TEST_DATABASE_URL } from './env.js';
import { runMigrations } from '../src/db/migrate.js';

export default async function setup() {
  await runMigrations(TEST_DATABASE_URL);
}
