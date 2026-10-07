import '../src/config/env.ts';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { loadConfig } from '../src/config/config.ts';
import { presentConversation } from '../src/services/conversation-view.service.ts';
import { db, closeDb } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { accounts, documents, employees, providerCalls } from '../src/db/schema.ts';
import { createConversation, replyConversation } from '../src/services/generate.service.ts';
import { remainingBudgetUsd } from '../src/llm/budget.ts';
import { utcToday } from '../src/lib/format.ts';
import type { Passage } from '../src/rag/retrieve.ts';
import { seed } from '../src/seed.ts';
import { queueVersion } from '../src/services/document-upload.service.ts';
import { runWorker } from '../src/worker.ts';
import { splitClaims } from './claims.ts';
import {
  NOT_CALIBRATED,
  callJudge,
  formatSupportLine,
  judgeGuard,
  liveJudgeComplete,
  loadJudgeLabels,
  scoreCalibration,
  supportRate,
  type AnswerJudge,
  type CalibrationResult,
  type JudgeComplete,
  type JudgeLabel,
  type SentenceVerdict,
} from './judge.ts';
import {
  EVAL_DATE,
  budgetGuard,
  estimateEvalCostUsd,
  generateCallCount,
  judgeableCaseCount,
  loadGolden,
  liveEvalGuard,
  scoreCase,
  summarize,
  targetsMet,
  type CaseScore,
  type GoldenCase,
} from './score.ts';

const JUDGE_CHARS = 4_000;
const CALIBRATION_CHUNK = 10;

const HERE = dirname(fileURLToPath(import.meta.url));
const KB_DIR = join(HERE, '../fixtures/kb');
const PROMPT_CHARS = 24_000;

function evalDatabaseUrl(appUrl: string): string {
  if (process.env.EVAL_DATABASE_URL) {
    return process.env.EVAL_DATABASE_URL;
  }
  return appUrl.replace(/\/[^/?#]+([?#].*)?$/, '/jarvis_eval$1');
}

function dbNameOf(url: string): string {
  const name = url.replace(/^[a-z]+:\/\/[^/]+\//, '').replace(/[?#].*$/, '');
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid eval database name: ${name}`);
  }
  return name;
}

async function ensureEvalDatabase(fromUrl: string, evalUrl: string): Promise<void> {
  const name = dbNameOf(evalUrl);
  const admin = new pg.Client({ connectionString: fromUrl });
  await admin.connect();
  try {
    const found = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!found.rowCount) {
      await admin.query(`create database ${name} owner jarvis`);
    }
  } finally {
    await admin.end();
  }
}

async function kbBytes(): Promise<number> {
  const files = await readdir(KB_DIR);
  let n = 0;
  for (const file of files) {
    n += (await stat(join(KB_DIR, file))).size;
  }
  return n;
}

function pct(n: number, d: number): string {
  if (!d) {
    return 'n/a';
  }
  return `${((100 * n) / d).toFixed(1)}% (${n}/${d})`;
}

async function applyRefundV3(employeeId: number): Promise<void> {
  const [doc] = await db().select().from(documents).where(eq(documents.title, 'Refund policy'));
  if (!doc) {
    throw new Error('Refund policy is missing from the eval seed.');
  }
  await queueVersion(doc.id, {
    effectiveAt: EVAL_DATE,
    note: 'Eval v3: 14-day window.',
    filename: 'refund-policy-v3.md',
    bytes: await readFile(join(KB_DIR, 'refund-policy-v3.md')),
    employeeId,
  });
  await runWorker({ once: true });
}

type CaseResult = {
  score: CaseScore;
  latencyMs: number[];
  answer: string;
  retrieved: string[];
  outcome: string;
  facts: Record<string, string>;
  passages: Record<string, string>;
};

async function runCase(
  spec: GoldenCase,
  input: { employeeId: number; accountId: number; config: ReturnType<typeof loadConfig> },
): Promise<CaseResult> {
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
  const facts = (latest?.facts ?? []) as { id: string; section: string; value?: string }[];
  const cited = [...text.matchAll(/\[F(\d+)\]/g)].map((m) => `F${m[1]}`);
  const choose = (latest?.clarifications ?? [])
    .filter((c) => c.kind === 'choose_record')
    .flatMap((c) => (c.options ?? []).map((o) => o.fact));
  const titles = [...new Set(retrieved.map((p) => p.title))];
  const cites = (latest?.cites ?? {}) as Record<string, { text?: string }>;
  const got = {
    outcome: latest?.outcome ?? 'failed',
    text,
    reviewReasons: (latest?.reviewReasons as string[]) ?? [],
    retrievedTitles: titles,
    citedSections: facts.filter((f) => cited.includes(f.id)).map((f) => f.section),
    chooseRecordOptions: choose,
  };
  return {
    score: scoreCase(spec, got),
    latencyMs: latencies,
    answer: text,
    retrieved: titles,
    outcome: got.outcome,
    facts: Object.fromEntries(facts.filter((f) => f.id && f.value).map((f) => [f.id, f.value!])),
    passages: Object.fromEntries(
      Object.entries(cites).map(([n, c]) => [n, c.text ?? '']),
    ),
  };
}

export async function main(): Promise<void> {
  const withJudge = process.argv.includes('--judge');
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
  if (withJudge) {
    const same = judgeGuard(cfg);
    if (same) {
      console.error(same);
      process.exit(1);
    }
  }

  const cases = await loadGolden();
  const generateCount = generateCallCount(cases);
  const labels = withJudge ? await loadJudgeLabels() : [];
  const judgeCount = withJudge ? Math.ceil(labels.length / CALIBRATION_CHUNK) + judgeableCaseCount(cases) : 0;
  const estimate = estimateEvalCostUsd(cfg, {
    indexChars: await kbBytes(),
    queryChars: 400,
    generateChars: PROMPT_CHARS,
    generateCount,
    judgeCount,
    judgeChars: JUDGE_CHARS,
  });
  const extra = withJudge ? ` + ${judgeCount} judge calls` : '';
  console.log(`Estimated cost: $${estimate.toFixed(4)} (${generateCount} generates + KB embeddings${extra})`);
  console.log(`Model: ${cfg.GENERATION_MODEL}  RETRIEVAL_MIN_SCORE=${cfg.RETRIEVAL_MIN_SCORE}`);
  if (withJudge) {
    console.log(`Judge: ${cfg.JUDGE_MODEL}  prompt ${cfg.JUDGE_PROMPT_VERSION}`);
  }

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
    if (!row) {
      throw new Error(`No account ${ref}`);
    }
    return row.id;
  };

  const complete: JudgeComplete | undefined = withJudge ? liveJudgeComplete(cfg) : undefined;
  let calibration: CalibrationResult | undefined;
  if (withJudge && complete) {
    console.log(`Calibrating judge (${labels.length} items)…`);
    // Chunked: 30+ verdicts in one call can hit the output-token cap.
    const got: JudgeLabel[] = [];
    for (let start = 0; start < labels.length; start += CALIBRATION_CHUNK) {
      const chunk = labels.slice(start, start + CALIBRATION_CHUNK);
      const calClaims = chunk.map((item, i) => ({ n: i + 1, text: item.sentence, cited: item.cited, malformed: false }));
      const calResult = await callJudge(calClaims, cfg, complete, employee!.id);
      if (calResult.error) {
        console.log(`  calibration chunk ${start / CALIBRATION_CHUNK + 1}: judge_error`);
      }
      got.push(
        ...chunk.map((_, i): JudgeLabel => {
          const v = calResult.error ? undefined : calResult.verdicts[i];
          return !v || v.label === 'malformed_citation' ? 'no_claim' : v.label;
        }),
      );
    }
    calibration = scoreCalibration(labels, got);
    console.log(
      `Calibration agreement: ${pct(calibration.agreementN, calibration.agreementD)}${calibration.trusted ? '' : `  ${NOT_CALIBRATED}`}`,
    );
    for (const [i, item] of labels.entries()) {
      if (got[i] !== item.label) {
        console.log(`  ${item.id} expected ${item.label} got ${got[i] ?? 'missing'}`);
      }
    }
    console.log('');
  }

  const scores: CaseScore[] = [];
  const latencies: number[] = [];
  const judged: { id: string; result: AnswerJudge }[] = [];
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
    if (withJudge && complete && (result.outcome === 'answer' || result.outcome === 'insufficient_evidence')) {
      const judgedCase = await callJudge(
        splitClaims(result.answer, { facts: result.facts, passages: result.passages }),
        cfg,
        complete,
        employee!.id,
      );
      judged.push({ id: spec.id, result: judgedCase });
      printJudgeCase(spec.id, judgedCase);
    }
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
  if (withJudge && calibration) {
    const support = judged.reduce(
      (acc, j) => {
        const r = supportRate(j.result.verdicts, j.result.error);
        return { n: acc.n + r.n, d: acc.d + r.d };
      },
      { n: 0, d: 0 },
    );
    const labelCounts = countLabels(judged);
    const judgeUsd = await judgeSpendUsd();
    console.log(`  Calibration agreement:  ${pct(calibration.agreementN, calibration.agreementD)}`);
    console.log(
      `  Support rate:           ${formatSupportLine(pct(support.n, support.d), calibration.trusted)}`,
    );
    console.log(`  Judge labels:           ${formatLabelCounts(labelCounts)}`);
    console.log(`  Malformed citations:    ${labelCounts.malformed_citation}`);
    console.log(`  Judge errors:           ${judged.filter((j) => j.result.error).length}`);
    console.log(`  Judge cost:             $${judgeUsd.toFixed(4)}`);
  }

  await closeDb();
  if (!targetsMet(totals)) {
    console.error('Eval targets not met (hit ≥ 90%, outcome ≥ 80%, 0 forbidden, p95 ≤ 15s).');
    process.exit(1);
  }
}

function printJudgeCase(id: string, result: AnswerJudge): void {
  if (result.error) {
    console.log(`  ${id} judge_error`);
    return;
  }
  const flagged = result.verdicts.filter((v) => v.label === 'unsupported' || v.label === 'partial');
  for (const v of flagged) {
    console.log(`  ${id} [${v.n}] ${v.label}: ${v.reason}`);
    console.log(`    ${v.text}`);
  }
}

function countLabels(judged: { result: AnswerJudge }[]): Record<SentenceVerdict['label'], number> {
  const counts: Record<SentenceVerdict['label'], number> = {
    supported: 0,
    partial: 0,
    unsupported: 0,
    no_claim: 0,
    malformed_citation: 0,
  };
  for (const row of judged) {
    if (row.result.error) {
      continue;
    }
    for (const v of row.result.verdicts) {
      counts[v.label] += 1;
    }
  }
  return counts;
}

function formatLabelCounts(counts: Record<SentenceVerdict['label'], number>): string {
  return (['supported', 'partial', 'unsupported', 'no_claim'] as const)
    .map((k) => `${k} ${counts[k]}`)
    .join(', ');
}

async function judgeSpendUsd(): Promise<number> {
  const [row] = await db()
    .select({
      n: sql<string>`coalesce(sum(coalesce(${providerCalls.costUsd}, ${providerCalls.estimatedCostUsd})), 0)`,
    })
    .from(providerCalls)
    .where(eq(providerCalls.kind, 'judge'));
  return Number(row?.n ?? 0);
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('eval/run.ts') || entry.endsWith('eval/run.js')) {
  await main();
}
