import { afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import './env.js';
import { closeDb, db } from '../src/db/index.js';

// Test files run one at a time (vitest.config.ts) and start from an empty database.
beforeAll(async () => {
  await db().execute(sql`
    do $$
    declare t text;
    begin
      for t in select tablename from pg_tables where schemaname = 'public'
      loop execute format('truncate table %I restart identity cascade', t); end loop;
    end $$;
  `);
});

afterAll(async () => {
  await closeDb();
});
