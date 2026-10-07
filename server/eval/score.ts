import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Config } from '../src/config/config.ts';
import { estimateCostUsd } from '../src/llm/budget.ts';

export const EVAL_DATE = '2026-10-02';
export const HIT_RATE_MIN = 0.9;
export const OUTCOME_MIN = 0.8;
export const P95_MAX_MS = 15_000;

const replySchema = z.object({
  selections: z.array(z.string()).optional(),
  text: z.string().optional(),
});

export const goldenCaseSchema = z.object({
  id: z.string(),
  account: z.string(),
  question: z.string(),
  replies: z.array(replySchema).optional(),
  expectedOutcome: z.union([z.string(), z.array(z.string())]),
  chooseRecordOptions: z.array(z.string()).optional(),
  reviewReasons: z.array(z.string()).optional(),
  expectedDocuments: z.array(z.string()).default([]),
  citedFactSections: z.array(z.string()).default([]),
  forbiddenPatterns: z.array(z.string()).default([]),
  applyV3: z.boolean().optional(),
});

export type GoldenCase = z.infer<typeof goldenCaseSchema>;

export type CaseGot = {
  outcome: string;
  text: string;
  reviewReasons: string[];
  retrievedTitles: string[];
  citedSections: string[];
  chooseRecordOptions?: string[];
};

export type CaseScore = {
  id: string;
  outcomeOk: boolean;
  reasonsOk: boolean;
  reasonsExpected: boolean;
  hit: boolean | null;
  factSectionsOk: boolean;
  chooseRecordOk: boolean | null;
  forbiddenHits: string[];
  removedCitations: number;
};

export function loadGoldenSync(raw: unknown): GoldenCase[] {
  const cases = z.array(goldenCaseSchema).parse(raw);
  const ids = cases.map((c) => c.id);
  if (new Set(ids).size !== 20 || !Array.from({ length: 20 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`).every((id) => ids.includes(id))) {
    throw new Error('golden.json must contain E01–E20 once each.');
  }
  return cases;
}

export async function loadGolden(path = join(dirname(fileURLToPath(import.meta.url)), 'golden.json')): Promise<GoldenCase[]> {
  return loadGoldenSync(JSON.parse(await readFile(path, 'utf8')));
}

export function outcomesOf(spec: GoldenCase): string[] {
  return Array.isArray(spec.expectedOutcome) ? spec.expectedOutcome : [spec.expectedOutcome];
}

export function matchesForbidden(text: string, pattern: string): boolean {
  if (/^\w+$/.test(pattern)) {
    return new RegExp(`\\b${pattern}\\b`, 'i').test(text);
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

export function scoreCase(spec: GoldenCase, got: CaseGot): CaseScore {
  const expectedReasons = spec.reviewReasons ?? [];
  const hit =
    spec.expectedDocuments.length === 0
      ? null
      : spec.expectedDocuments.every((title) => got.retrievedTitles.includes(title));
  const choose =
    spec.chooseRecordOptions == null
      ? null
      : sameSet(spec.chooseRecordOptions, got.chooseRecordOptions ?? []);
  return {
    id: spec.id,
    outcomeOk: outcomesOf(spec).includes(got.outcome),
    reasonsOk: expectedReasons.every((r) => got.reviewReasons.includes(r)),
    reasonsExpected: expectedReasons.length > 0,
    hit,
    factSectionsOk: spec.citedFactSections.every((s) => got.citedSections.includes(s)),
    chooseRecordOk: choose,
    forbiddenHits: spec.forbiddenPatterns.filter((p) => matchesForbidden(got.text, p)),
    removedCitations: got.reviewReasons.filter((r) => r === 'invalid_citation_removed').length,
  };
}

export function p95(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!;
}

export type EvalTotals = {
  hitRate: number;
  hitN: number;
  hitD: number;
  outcomeAccuracy: number;
  outcomeN: number;
  outcomeD: number;
  reasonMatches: number;
  reasonD: number;
  chooseMatches: number;
  chooseD: number;
  factMatches: number;
  factD: number;
  removedCitations: number;
  forbiddenHits: number;
  p95Ms: number;
};

export function summarize(
  scores: CaseScore[],
  latenciesMs: number[],
): EvalTotals {
  const named = scores.filter((s) => s.hit != null);
  const reasonScores = scores.filter((s) => s.reasonsExpected);
  return {
    hitD: named.length,
    hitN: named.filter((s) => s.hit).length,
    hitRate: named.length ? named.filter((s) => s.hit).length / named.length : 1,
    outcomeD: scores.length,
    outcomeN: scores.filter((s) => s.outcomeOk).length,
    outcomeAccuracy: scores.length ? scores.filter((s) => s.outcomeOk).length / scores.length : 0,
    reasonD: reasonScores.length,
    reasonMatches: reasonScores.filter((s) => s.reasonsOk).length,
    chooseD: scores.filter((s) => s.chooseRecordOk != null).length,
    chooseMatches: scores.filter((s) => s.chooseRecordOk).length,
    factD: scores.length,
    factMatches: scores.filter((s) => s.factSectionsOk).length,
    removedCitations: scores.reduce((n, s) => n + s.removedCitations, 0),
    forbiddenHits: scores.reduce((n, s) => n + s.forbiddenHits.length, 0),
    p95Ms: p95(latenciesMs),
  };
}

export function generateCallCount(cases: GoldenCase[]): number {
  return cases.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);
}

export function judgeableCaseCount(cases: GoldenCase[]): number {
  return cases.filter((c) => outcomesOf(c).some((o) => o === 'answer' || o === 'insufficient_evidence')).length;
}

export function estimateEvalCostUsd(
  cfg: Config,
  input: {
    indexChars: number;
    queryChars: number;
    generateChars: number;
    generateCount: number;
    judgeCount?: number;
    judgeChars?: number;
  },
): number {
  const index = estimateCostUsd('embed_document', input.indexChars, cfg);
  const queries = input.generateCount * estimateCostUsd('embed_query', input.queryChars, cfg);
  const gens = input.generateCount * estimateCostUsd('generate', input.generateChars, cfg);
  const judges = (input.judgeCount ?? 0) * estimateCostUsd('judge', input.judgeChars ?? 4_000, cfg);
  return index + queries + gens + judges;
}

export function liveEvalGuard(provider: string): string | null {
  if (provider === 'stub') {
    return 'pnpm eval refuses stub mode. Set LLM_PROVIDER=gemini.';
  }
  return null;
}

export function budgetGuard(estimateUsd: number, remainingUsd: number): string | null {
  if (estimateUsd > remainingUsd) {
    return `Estimated cost $${estimateUsd.toFixed(4)} exceeds remaining daily budget $${remainingUsd.toFixed(4)}.`;
  }
  return null;
}

export function targetsMet(totals: EvalTotals): boolean {
  return (
    totals.hitRate >= HIT_RATE_MIN &&
    totals.outcomeAccuracy >= OUTCOME_MIN &&
    totals.forbiddenHits === 0 &&
    totals.p95Ms <= P95_MAX_MS
  );
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');
}
