import '../src/env.ts';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq } from 'drizzle-orm';
import pg from 'pg';
import { loadConfig } from '../src/config.ts';
import { presentConversation } from '../src/services/conversation-view.service.ts';
import { db, closeDb } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { accounts, documents, employees, providerCalls } from '../src/db/schema.ts';
import { createConversation, replyConversation } from '../src/services/generate.service.ts';
import { remainingBudgetUsd } from '../src/llm/budget.ts';
import { utcToday } from '../src/lib/format.ts';
import type { Passage } from '../src/retrieve.ts';
import { seed } from '../src/seed.ts';
import { queueVersion } from '../src/services/document-upload.service.ts';
import { runWorker } from '../src/worker.ts';
import {
  EVAL_DATE,
  budgetGuard,
  estimateEvalCostUsd,
  generateCallCount,
  loadGolden,
  liveEvalGuard,
  scoreCase,
  summarize,
  targetsMet,
  type CaseScore,
  type GoldenCase,
} from './score.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const KB_DIR = join(HERE, '../fixtures/kb');
const PROMPT_CHARS = 24_000;

function evalDatabaseUrl(appUrl: string): string {
  if (process.env.EVAL_DATABASE_URL) return process.env.EVAL_DATABASE_URL;
  return appUrl.replace(/\/[^/?#]+([?#].*)?$/, '/jarvis_eval$1');
}

function dbNameOf(url: string): string {
  const name = url.replace(/^[a-z]+:\/\/[^/]+\//, '').replace(/[?#].*$/, '');
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Invalid eval database name: ${name}`);
  return name;
}

async function ensureEvalDatabase(fromUrl: string, evalUrl: string): Promise<void> {
  const name = dbNameOf(evalUrl);
  const admin = new pg.Client({ connectionString: fromUrl });
  await admin.connect();
  try {
    const found = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!found.rowCount) await admin.query(`create database ${name} owner jarvis`);
  } finally {
    await admin.end();
  }
}

async function kbBytes(): Promise<number> {
  const files = await readdir(KB_DIR);
  let n = 0;
  for (const file of files) n += (await stat(join(KB_DIR, file))).size;
  return n;
}

function pct(n: number, d: number): string {
  if (!d) return 'n/a';
  return `${((100 * n) / d).toFixed(1)}% (${n}/${d})`;
}

async function applyRefundV3(employeeId: number): Promise<void> {
  const [doc] = await db().select().from(documents).where(eq(documents.title, 'Refund policy'));
  if (!doc) throw new Error('Refund policy is missing from the eval seed.');
  await queueVersion(doc.id, {
    effectiveAt: EVAL_DATE,
    note: 'Eval v3: 14-day window.',
    filename: 'refund-policy-v3.md',
    bytes: await readFile(join(KB_DIR, 'refund-policy-v3.md')),
    employeeId,
  });
  await runWorker({ once: true });
}

async function runCase(
  spec: GoldenCase,
  input: { employeeId: number; accountId: number; config: ReturnType<typeof loadConfig> },
): Promise<{ score: CaseScore; latencyMs: number[]; answer: string; retrieved: string[] }> {
  let retrieved: Passage[] = [];
  const deps = {
    purpose: 'eval' as const,
    asOf: EVAL_DATE,
    afterRetrieve: async (passages: Passage[]) => {
      retrieved = passages;
    },
  };
  const latencies: number[] = [];
  const started = Date.now();
  const conversationId = await createConversation({
    accountId: input.accountId,
    question: spec.question,
    employeeId: input.employeeId,
    config: input.config,
    deps,
  });
  latencies.push(Date.now() - started);

  let presented = await presentConversation(conversationId, input.employeeId);
  if (spec.replies?.length && presented.answers.at(-1)?.outcome === 'clarification_required') {
    try {
      for (const reply of spec.replies) {
        const t = Date.now();
        await replyConversation({
          conversationId,
          employeeId: input.employeeId,
          selections: reply.selections,
          text: reply.text,
          config: input.config,
          deps,
        });
        latencies.push(Date.now() - t);
      }
      presented = await presentConversation(conversationId, input.employeeId);
    } catch {
      // Score the clarification turn; a bad selection or free_text question is an outcome miss.
    }
  }

  const latest = presented.answers.at(-1);
  let text = latest?.text ?? '';
  if (!latest) {
    const [fail] = await db()
      .select({ errorCode: providerCalls.errorCode })
      .from(providerCalls)
      .where(eq(providerCalls.conversationId, conversationId))
      .orderBy(desc(providerCalls.id))
      .limit(1);
    text = fail?.errorCode ? `(generate failed: ${fail.errorCode})` : '(no answer)';
  }
  const facts = (latest?.facts ?? []) as { id: string; section: string }[];
  const cited = [...text.matchAll(/\[F(\d+)\]/g)].map((m) => `F${m[1]}`);
  const choose = (latest?.clarifications ?? [])
    .filter((c) => c.kind === 'choose_record')
    .flatMap((c) => (c.options ?? []).map((o) => o.fact));
  const titles = [...new Set(retrieved.map((p) => p.title))];
  const got = {
    outcome: latest?.outcome ?? 'failed',
    text,
    reviewReasons: (latest?.reviewReasons as string[]) ?? [],
    retrievedTitles: titles,
    citedSections: facts.filter((f) => cited.includes(f.id)).map((f) => f.section),
    chooseRecordOptions: choose,
  };
  return { score: scoreCase(spec, got), latencyMs: latencies, answer: text, retrieved: titles };
}

export async function main(): Promise<void> {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const evalUrl = evalDatabaseUrl(appUrl);
  process.env.DATABASE_URL = evalUrl;
  const cfg = loadConfig(process.env);

  const stub = liveEvalGuard(cfg.LLM_PROVIDER);
  if (stub) {
    console.error(stub);
    process.exit(1);
  }

  const cases = await loadGolden();
  const generateCount = generateCallCount(cases);
  const estimate = estimateEvalCostUsd(cfg, {
    indexChars: await kbBytes(),
    queryChars: 400,
    generateChars: PROMPT_CHARS,
    generateCount,
  });
  console.log(`Estimated cost: $${estimate.toFixed(4)} (${generateCount} generates + KB embeddings)`);
  console.log(`Model: ${cfg.GENERATION_MODEL}  RETRIEVAL_MIN_SCORE=${cfg.RETRIEVAL_MIN_SCORE}`);

  await ensureEvalDatabase(appUrl, evalUrl);
  await runMigrations(evalUrl);

  const remaining = await remainingBudgetUsd(cfg);
  const over = budgetGuard(estimate, remaining);
  if (over) {
    console.error(over);
    process.exit(1);
  }
  console.log(`Remaining daily budget: $${remaining.toFixed(4)}`);

  console.log(`Seeding eval DB (${dbNameOf(evalUrl)}) with D=${EVAL_DATE}…`);
  await seed(db(), { date: EVAL_DATE });
  await runWorker({ once: true });

  const [employee] = await db().select().from(employees).limit(1);
  const accountRows = await db().select({ id: accounts.id, ref: accounts.ref }).from(accounts);
  const accountId = (ref: string) => {
    const row = accountRows.find((a) => a.ref === ref);
    if (!row) throw new Error(`No account ${ref}`);
    return row.id;
  };

  const scores: CaseScore[] = [];
  const latencies: number[] = [];
  for (const spec of cases) {
    if (spec.applyV3) {
      console.log('Applying Refund policy v3…');
      await applyRefundV3(employee!.id);
    }
    process.stdout.write(`${spec.id} ${spec.account}… `);
    try {
      const result = await runCase(spec, {
        employeeId: employee!.id,
        accountId: accountId(spec.account),
        config: cfg,
      });
      scores.push(result.score);
      latencies.push(...result.latencyMs);
      const flags = [
        result.score.outcomeOk ? 'outcome' : 'OUTCOME',
        result.score.hit === false ? 'MISS' : result.score.hit ? 'hit' : '',
        result.score.forbiddenHits.length ? `FORBID:${result.score.forbiddenHits.join(',')}` : '',
      ].filter(Boolean);
      console.log(`${result.score.outcomeOk ? 'ok' : 'fail'}  ${flags.join(' ')}`);
      console.log(`--- ${spec.id} ---`);
      console.log(result.answer || '(no answer)');
    console.log(`retrieved: ${result.retrieved.join(', ') || '(none)'}`);
    console.log(
      `reasons: ${result.score.reasonsOk ? 'ok' : 'miss'}  choose: ${result.score.chooseRecordOk == null ? 'n/a' : result.score.chooseRecordOk ? 'ok' : 'miss'}`,
    );
    console.log('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      scores.push(
        scoreCase(spec, {
          outcome: 'failed',
          text: '',
          reviewReasons: [],
          retrievedTitles: [],
          citedSections: [],
        }),
      );
      console.log(`fail  ${message}`);
      console.log(`--- ${spec.id} ---`);
      console.log(`(error) ${message}`);
      console.log('');
    }
  }

  const spent = await remainingBudgetUsd(cfg);
  const used = cfg.DAILY_BUDGET_USD - spent;
  const totals = summarize(scores, latencies);
  console.log('Report');
  console.log(`  Retrieval hit rate:     ${pct(totals.hitN, totals.hitD)}`);
  console.log(`  Outcome accuracy:       ${pct(totals.outcomeN, totals.outcomeD)}`);
  console.log(`  Review-reason matches:  ${pct(totals.reasonMatches, totals.reasonD)}`);
  console.log(`  Choose-record matches:  ${pct(totals.chooseMatches, totals.chooseD)}`);
  console.log(`  Fact-section matches:   ${pct(totals.factMatches, totals.factD)}`);
  console.log(`  Removed citations:      ${totals.removedCitations}`);
  console.log(`  Forbidden-pattern hits: ${totals.forbiddenHits}`);
  console.log(`  Cost:                   $${used.toFixed(4)}  (as of ${utcToday()})`);
  console.log(`  p95 latency:            ${(totals.p95Ms / 1000).toFixed(2)} s`);

  await closeDb();
  if (!targetsMet(totals)) {
    console.error('Eval targets not met (hit ≥ 90%, outcome ≥ 80%, 0 forbidden, p95 ≤ 15s).');
    process.exit(1);
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('eval/run.ts') || entry.endsWith('eval/run.js')) {
  await main();
}
