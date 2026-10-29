import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { EVIDENCE_STATUSES } from '../src/db/schema.ts';
import { matchesForbidden } from './score.ts';

// REQ_V3 §2 SC3-1 .. SC3-3 and §12.
export const RFP_HIT_RATE_MIN = 0.8;
export const RFP_STATUS_MIN = 0.7;

export const rfpGoldenCaseSchema = z.object({
  id: z.string(),
  question: z.string(),
  section: z.string().optional(),
  expectedStatus: z.enum(EVIDENCE_STATUSES),
  expectedDocuments: z.array(z.string()).default([]),
  forbiddenPatterns: z.array(z.string()).default([]),
  note: z.string().optional(),
});

export type RfpGoldenCase = z.infer<typeof rfpGoldenCaseSchema>;

/** `FAILED` = the question never produced an answer (error, or still queued after a budget stop). */
export type GotStatus = (typeof EVIDENCE_STATUSES)[number] | 'FAILED';

export type RfpCaseGot = {
  status: GotStatus;
  modelStatus: GotStatus;
  text: string;
  retrievedTitles: string[];
  reviewReasons: string[];
};

export type RfpCaseScore = {
  id: string;
  expected: RfpGoldenCase['expectedStatus'];
  got: GotStatus;
  statusOk: boolean;
  /** null when the case names no expected document. */
  hit: boolean | null;
  downgraded: boolean;
  removedCitations: number;
  forbiddenHits: string[];
  /** SC3-2: an unanswerable question answered as HIGH. */
  unsafeHigh: boolean;
};

export function loadRfpGoldenSync(raw: unknown): RfpGoldenCase[] {
  const cases = z.array(rfpGoldenCaseSchema).parse(raw);
  if (new Set(cases.map((c) => c.id)).size !== cases.length) {
    throw new Error('rfp-golden.json ids must be unique.');
  }
  return cases;
}

export async function loadRfpGolden(
  path = join(dirname(fileURLToPath(import.meta.url)), 'rfp-golden.json'),
): Promise<RfpGoldenCase[]> {
  return loadRfpGoldenSync(JSON.parse(await readFile(path, 'utf8')));
}

export function scoreRfpCase(spec: RfpGoldenCase, got: RfpCaseGot): RfpCaseScore {
  return {
    id: spec.id,
    expected: spec.expectedStatus,
    got: got.status,
    statusOk: got.status === spec.expectedStatus,
    // RFP-EVAL-02: any expected document among the retrieved passages.
    hit: spec.expectedDocuments.length === 0 ? null : spec.expectedDocuments.some((t) => got.retrievedTitles.includes(t)),
    downgraded: got.status !== 'FAILED' && got.modelStatus !== got.status,
    removedCitations: got.reviewReasons.filter((r) => r === 'invalid_citation_removed').length,
    forbiddenHits: spec.forbiddenPatterns.filter((p) => matchesForbidden(got.text, p)),
    unsafeHigh: spec.expectedStatus === 'INSUFFICIENT_EVIDENCE' && got.status === 'HIGH_EVIDENCE',
  };
}

export type RfpTotals = {
  hitN: number;
  hitD: number;
  hitRate: number;
  statusN: number;
  statusD: number;
  statusAccuracy: number;
  /** confusion[expected][got] */
  confusion: Record<string, Record<string, number>>;
  downgrades: number;
  removedCitations: number;
  forbiddenHits: number;
  unsafeHigh: number;
  failures: number;
};

export function summarizeRfp(scores: RfpCaseScore[]): RfpTotals {
  const named = scores.filter((s) => s.hit != null);
  const hitN = named.filter((s) => s.hit).length;
  const statusN = scores.filter((s) => s.statusOk).length;
  const confusion: RfpTotals['confusion'] = {};
  for (const expected of EVIDENCE_STATUSES) {
    confusion[expected] = Object.fromEntries([...EVIDENCE_STATUSES, 'FAILED'].map((g) => [g, 0]));
  }
  for (const s of scores) {
    confusion[s.expected]![s.got] = (confusion[s.expected]![s.got] ?? 0) + 1;
  }
  return {
    hitN,
    hitD: named.length,
    hitRate: named.length ? hitN / named.length : 1,
    statusN,
    statusD: scores.length,
    statusAccuracy: scores.length ? statusN / scores.length : 0,
    confusion,
    downgrades: scores.filter((s) => s.downgraded).length,
    removedCitations: scores.reduce((n, s) => n + s.removedCitations, 0),
    forbiddenHits: scores.reduce((n, s) => n + s.forbiddenHits.length, 0),
    unsafeHigh: scores.filter((s) => s.unsafeHigh).length,
    failures: scores.filter((s) => s.got === 'FAILED').length,
  };
}

/** SC3-1, SC3-2 and SC3-3 together. */
export function rfpTargetsMet(t: RfpTotals): boolean {
  return t.hitRate >= RFP_HIT_RATE_MIN && t.statusAccuracy >= RFP_STATUS_MIN && t.unsafeHigh === 0 && t.forbiddenHits === 0;
}
