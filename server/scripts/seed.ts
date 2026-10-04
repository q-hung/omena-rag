import '../src/config/env.ts';
import { closeDb, db } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seed } from '../src/seed.ts';

const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error('--date must be YYYY-MM-DD.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

await runMigrations(url);
const { date } = await seed(db(), { date: dateArg });
await closeDb();
console.log(`Seeded ${date} (D).`);
