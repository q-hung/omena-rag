import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  budgetGuard,
  estimateEvalCostUsd,
  generateCallCount,
  judgeableCaseCount,
  liveEvalGuard,
  loadGolden,
  matchesForbidden,
  p95,
  scoreCase,
  summarize,
  targetsMet,
} from '../eval/score.ts';
import { loadConfig } from '../src/config/config.ts';
import { formatSupportLine, NOT_CALIBRATED, scoreCalibration } from '../eval/judge.ts';

describe('eval', () => {
  it('golden.json holds E01–E20', async () => {
    const cases = await loadGolden();
    expect(cases.map((c) => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`));
    expect(cases.find((c) => c.id === 'E04')?.chooseRecordOptions).toEqual(['F10', 'F11']);
    expect(cases.find((c) => c.id === 'E13')?.applyV3).toBe(true);
    expect(generateCallCount(cases)).toBe(21);
  });

  it('scores a hit, subset reasons, and forbidden patterns', () => {
    const spec = {
      id: 'E08',
      account: 'A-1005',
      question: 'webhooks',
      expectedOutcome: 'answer',
      reviewReasons: ['conflict'],
      expectedDocuments: ['Webhooks developer guide'],
      citedFactSections: ['account'],
      forbiddenPatterns: ['not supported', 'yes'],
    };
    const ok = scoreCase(spec, {
      outcome: 'answer',
      text: 'No endpoints are configured. Add one under Developers.',
      reviewReasons: ['conflict', 'policy_applicability'],
      retrievedTitles: ['Webhooks developer guide', 'Plan comparison'],
      citedSections: ['account', 'features'],
    });
    expect(ok).toMatchObject({
      outcomeOk: true,
      reasonsOk: true,
      hit: true,
      factSectionsOk: true,
      forbiddenHits: [],
    });

    const bad = scoreCase(spec, {
      outcome: 'insufficient_evidence',
      text: 'Webhooks are not supported. Yes they are missing.',
      reviewReasons: [],
      retrievedTitles: ['Plan comparison'],
      citedSections: [],
    });
    expect(bad.outcomeOk).toBe(false);
    expect(bad.reasonsOk).toBe(false);
    expect(bad.hit).toBe(false);
    expect(bad.forbiddenHits).toEqual(['not supported', 'yes']);
  });

  it('treats E05 as either answer or insufficient_evidence', () => {
    const spec = {
      id: 'E05',
      account: 'A-1003',
      question: 'refund',
      expectedOutcome: ['answer', 'insufficient_evidence'],
      reviewReasons: ['exception_unclear'],
      expectedDocuments: ['Refund policy'],
      citedFactSections: ['payments'],
      forbiddenPatterns: [],
    };
    expect(
      scoreCase(spec, {
        outcome: 'insufficient_evidence',
        text: 'Policy is silent [F10]',
        reviewReasons: ['exception_unclear'],
        retrievedTitles: ['Refund policy'],
        citedSections: ['payments'],
      }).outcomeOk,
    ).toBe(true);
  });

  it('matches choose_record options as a set', () => {
    const spec = {
      id: 'E04',
      account: 'A-1003',
      question: 'refund',
      expectedOutcome: 'clarification_required',
      chooseRecordOptions: ['F10', 'F11'],
      expectedDocuments: [],
      citedFactSections: [],
      forbiddenPatterns: [],
    };
    expect(
      scoreCase(spec, {
        outcome: 'clarification_required',
        text: '',
        reviewReasons: [],
        retrievedTitles: [],
        citedSections: [],
        chooseRecordOptions: ['F11', 'F10'],
      }).chooseRecordOk,
    ).toBe(true);
  });

  it('summarizes targets and p95', () => {
    const scores = [
      scoreCase(
        {
          id: 'E01',
          account: 'A-1001',
          question: 'sso',
          expectedOutcome: 'answer',
          expectedDocuments: ['SSO setup guide'],
          citedFactSections: [],
          forbiddenPatterns: [],
        },
        { outcome: 'answer', text: 'Basic', reviewReasons: [], retrievedTitles: ['SSO setup guide'], citedSections: [] },
      ),
    ];
    const totals = summarize(scores, [1_000, 2_000, 3_000, 4_000]);
    expect(totals.hitRate).toBe(1);
    expect(totals.outcomeAccuracy).toBe(1);
    expect(totals.forbiddenHits).toBe(0);
    expect(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])).toBe(19);
    expect(targetsMet({ ...totals, p95Ms: 14_000 })).toBe(true);
    expect(targetsMet({ ...totals, p95Ms: 16_000 })).toBe(false);
  });

  it('refuses stub mode and an over-budget estimate', () => {
    expect(liveEvalGuard('stub')).toMatch(/stub/i);
    expect(liveEvalGuard('gemini')).toBeNull();
    expect(budgetGuard(1, 0.5)).toMatch(/exceeds/);
    expect(budgetGuard(0.2, 1)).toBeNull();
  });

  it('word-boundary forbidden match does not trip on yesterday', () => {
    expect(matchesForbidden('yesterday the charge failed', 'yes')).toBe(false);
    expect(matchesForbidden('Yes, usage billing exists', 'yes')).toBe(true);
  });

  it('pnpm eval exits when LLM_PROVIDER=stub', () => {
    const result = spawnSync(process.execPath, ['eval/run.ts'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, LLM_PROVIDER: 'stub' },
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/stub/i);
  });

  it('JDG-01: without judgeCount the estimate matches T27', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://jarvis:jarvis@localhost:5433/jarvis' });
    const base = { indexChars: 10_000, queryChars: 400, generateChars: 24_000, generateCount: 16 };
    expect(estimateEvalCostUsd(cfg, { ...base, judgeCount: 0 })).toBe(estimateEvalCostUsd(cfg, base));
    expect(estimateEvalCostUsd(cfg, { ...base, judgeCount: 14 })).toBeGreaterThan(estimateEvalCostUsd(cfg, base));
  });

  it('counts judgeable golden cases', async () => {
    const cases = await loadGolden();
    expect(judgeableCaseCount(cases)).toBeGreaterThanOrEqual(12);
  });

  it('JDG-04: all-supported stub prints the not-calibrated warning', () => {
    const cal = scoreCalibration(
      [
        { id: 'a', sentence: 'x', cited: 'y', label: 'unsupported' },
        { id: 'b', sentence: 'x', cited: 'y', label: 'supported' },
      ],
      ['supported', 'supported'],
    );
    expect(formatSupportLine('50.0% (1/2)', cal.trusted)).toBe(`50.0% (1/2)  ${NOT_CALIBRATED}`);
  });

  it('pnpm eval --judge still refuses stub (JDG-01, JDG-05)', () => {
    const result = spawnSync(process.execPath, ['eval/run.ts', '--judge'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, LLM_PROVIDER: 'stub' },
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/stub/i);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/Judge not calibrated/);
  });
});
