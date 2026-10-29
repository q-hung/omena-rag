import '../src/config/env.ts';
import { loadConfig } from '../src/config/config.ts';
import { closeDb, db } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { employees } from '../src/db/schema.ts';
import { remainingBudgetUsd } from '../src/llm/budget.ts';
import { seed } from '../src/seed.ts';
import { queueQuestions } from '../src/services/rfp-queue.service.ts';
import { getRfpProcessing } from '../src/services/rfp-processing.service.ts';
import { createRfp, getRfp } from '../src/services/rfp.service.ts';
import { runWorker } from '../src/worker.ts';
import { dbNameOf, ensureEvalDatabase, evalDatabaseUrl, kbBytes, pct } from './run.ts';
import {
  RFP_HIT_RATE_MIN,
  RFP_STATUS_MIN,
  loadRfpGolden,
  rfpTargetsMet,
  scoreRfpCase,
  summarizeRfp,
  type GotStatus,
  type RfpCaseScore,
} from './rfp-score.ts';
import { EVAL_DATE, budgetGuard, estimateEvalCostUsd, liveEvalGuard } from './score.ts';

const PROMPT_CHARS = 24_000;

export async function main(): Promise<void> {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const evalUrl = evalDatabaseUrl(appUrl);
  process.env.DATABASE_URL = evalUrl;
  const cfg = loadConfig(process.env);

  const stub = liveEvalGuard(cfg.LLM_PROVIDER, 'pnpm eval:rfp');
  if (stub) {
    console.error(stub);
    process.exit(1);
  }

  const cases = await loadRfpGolden();
  const estimate = estimateEvalCostUsd(cfg, {
    indexChars: await kbBytes(),
    queryChars: 400,
    generateChars: PROMPT_CHARS,
    generateCount: cases.length,
  });
  console.log(`Estimated cost: $${estimate.toFixed(4)} (${cases.length} questions + KB embeddings)`);
  console.log(`Model: ${cfg.GENERATION_MODEL}  RETRIEVAL_MODE=${cfg.RETRIEVAL_MODE}  RETRIEVAL_MIN_SCORE=${cfg.RETRIEVAL_MIN_SCORE}`);

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
  const created = await createRfp({
    title: `RFP eval ${new Date().toISOString()}`,
    questions: cases.map((c) => ({ text: c.question, section: c.section })),
    employeeId: employee!.id,
  });
  await queueQuestions(created.id, employee!.id, false);
  console.log(`Processing ${cases.length} questions…`);
  await runWorker({ once: true, rfp: { workerLog: () => {} } });

  const rfp = await getRfp(created.id, employee!.id);
  const processing = await getRfpProcessing(created.id);
  const scores: RfpCaseScore[] = [];
  const answers: string[] = [];
  for (const [i, spec] of cases.entries()) {
    const q = rfp.questions[i]!;
    const a = q.status === 'done' ? q.latestAnswer : null;
    const got = a
      ? {
          status: a.evidenceStatus as GotStatus,
          modelStatus: a.modelEvidenceStatus as GotStatus,
          text: a.answerText,
          retrievedTitles: [...new Set(a.sources.map((s) => s.title))],
          reviewReasons: a.reviewReasons as string[],
        }
      : { status: 'FAILED' as const, modelStatus: 'FAILED' as const, text: '', retrievedTitles: [], reviewReasons: [] };
    const score = scoreRfpCase(spec, got);
    scores.push(score);
    const flags = [
      score.statusOk ? 'status' : 'STATUS',
      score.hit === false ? 'MISS' : score.hit ? 'hit' : '',
      score.downgraded ? 'downgraded' : '',
      score.unsafeHigh ? 'UNSAFE_HIGH' : '',
      score.forbiddenHits.length ? `FORBID:${score.forbiddenHits.join(',')}` : '',
    ].filter(Boolean);
    answers.push(
      [
        `--- ${spec.id} expected ${spec.expectedStatus}, got ${got.status}${q.errorCode ? ` (${q.errorCode})` : ''}  ${flags.join(' ')}`,
        `Q: ${spec.question}`,
        got.text || '(no answer)',
        `retrieved: ${got.retrievedTitles.join(', ') || '(none)'}`,
        '',
      ].join('\n'),
    );
  }
  console.log(`\n${answers.join('\n')}`);

  const totals = summarizeRfp(scores);
  console.log('Report');
  console.log(`  Retrieval hit rate:     ${pct(totals.hitN, totals.hitD)}   (SC3-1 ≥ ${RFP_HIT_RATE_MIN * 100}%)`);
  console.log(`  Status accuracy:        ${pct(totals.statusN, totals.statusD)}   (SC3-2 ≥ ${RFP_STATUS_MIN * 100}%)`);
  console.log(`  INSUFFICIENT as HIGH:   ${totals.unsafeHigh}   (SC3-2 must be 0)`);
  console.log(`  Forbidden-pattern hits: ${totals.forbiddenHits}   (SC3-3 must be 0)`);
  console.log(`  Server downgrades:      ${totals.downgrades}`);
  console.log(`  Removed citations:      ${totals.removedCitations}`);
  console.log(`  Failures:               ${totals.failures}`);
  console.log(`  Cost:                   $${processing.totals.costUsd.toFixed(4)}   (${processing.totals.calls} provider calls, ${processing.totals.failures} failed)`);
  console.log(`  p95 call latency:       ${processing.totals.p95LatencyMs == null ? 'n/a' : `${(processing.totals.p95LatencyMs / 1000).toFixed(2)} s`}`);
  console.log('\nConfusion (rows expected, columns got)');
  const cols = ['HIGH_EVIDENCE', 'PARTIAL_EVIDENCE', 'INSUFFICIENT_EVIDENCE', 'FAILED'];
  console.log(`  ${''.padEnd(22)}${cols.map((c) => c.slice(0, 8).padEnd(10)).join('')}`);
  for (const [expected, row] of Object.entries(totals.confusion)) {
    console.log(`  ${expected.padEnd(22)}${cols.map((c) => String(row[c]).padEnd(10)).join('')}`);
  }

  await closeDb();
  if (!rfpTargetsMet(totals)) {
    console.error('RFP eval targets not met (SC3-1 hit ≥ 80%, SC3-2 status ≥ 70% and no INSUFFICIENT as HIGH, SC3-3 no forbidden patterns).');
    process.exit(1);
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('eval/rfp-run.ts') || entry.endsWith('eval/rfp-run.js')) {
  await main();
}
