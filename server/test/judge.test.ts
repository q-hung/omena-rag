import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { splitClaims } from '../eval/claims.ts';
import {
  NOT_CALIBRATED,
  callJudge,
  formatSupportLine,
  judgeGuard,
  loadJudgeLabels,
  mapVerdicts,
  scoreCalibration,
  supportRate,
  type JudgeLabelItem,
} from '../eval/judge.ts';
import { loadConfig, type Config } from '../src/config/config.ts';
import { db } from '../src/db/index.ts';
import { employees, providerCalls } from '../src/db/schema.ts';
import { AppError } from '../src/errors.ts';

const cfg = (): Config =>
  loadConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    JUDGE_MODEL: 'gemini-3-flash-preview',
    GENERATION_MODEL: 'gemini-3.1-flash-lite',
  });

const claims = splitClaims('The account is on Basic [F1]. SSO is Enterprise only [1].', {
  facts: { F1: 'Basic' },
  passages: { '1': 'SSO is Enterprise only.' },
});

describe('judge', () => {
  it('loads ≥ 30 calibration items including known-bad cases', async () => {
    const items = await loadJudgeLabels();
    expect(items.length).toBeGreaterThanOrEqual(30);
    expect(items.filter((i) => i.label === 'unsupported').length).toBeGreaterThanOrEqual(4);
    expect(items.some((i) => i.cited.includes('Add endpoint'))).toBe(true);
    expect(items.some((i) => /12 Oct 2026/.test(i.sentence))).toBe(true);
    expect(items.some((i) => /payments team/.test(i.sentence))).toBe(true);
  });

  it('JDG-03: missing, duplicate or unknown verdict → judge_error', () => {
    expect(mapVerdicts(claims, { verdicts: [{ sentence: 1, label: 'supported', reason: 'ok' }] }).error).toBe(true);
    expect(
      mapVerdicts(claims, {
        verdicts: [
          { sentence: 1, label: 'supported', reason: 'ok' },
          { sentence: 1, label: 'supported', reason: 'dup' },
          { sentence: 2, label: 'supported', reason: 'ok' },
        ],
      }).error,
    ).toBe(true);
    expect(
      mapVerdicts(claims, {
        verdicts: [
          { sentence: 1, label: 'maybe', reason: 'ok' },
          { sentence: 2, label: 'supported', reason: 'ok' },
        ],
      } as unknown).error,
    ).toBe(true);
    const ok = mapVerdicts(claims, {
      verdicts: [
        { sentence: 1, label: 'supported', reason: 'fact matches' },
        { sentence: 2, label: 'supported', reason: 'passage matches' },
      ],
    });
    expect(ok.error).toBe(false);
    expect(supportRate(ok.verdicts, ok.error)).toEqual({ n: 2, d: 2 });
  });

  it('does not count judge_error as supported', () => {
    const bad = mapVerdicts(claims, { verdicts: [] });
    expect(bad.error).toBe(true);
    expect(supportRate(bad.verdicts, bad.error)).toEqual({ n: 0, d: 0 });
  });

  it('JDG-04: all-supported stub fails calibration', () => {
    const items: JudgeLabelItem[] = [
      { id: 'a', sentence: 'ok', cited: 'x', label: 'supported' },
      { id: 'b', sentence: 'bad', cited: 'y', label: 'unsupported' },
    ];
    const cal = scoreCalibration(items, ['supported', 'supported']);
    expect(cal.trusted).toBe(false);
    expect(cal.falseSupported).toBe(1);
    expect(formatSupportLine('100.0% (1/1)', cal.trusted)).toContain(NOT_CALIBRATED);
  });

  it('JDG-05: same model refuses; stub is refused as EVAL-01', () => {
    expect(judgeGuard(cfg())).toBeNull();
    expect(
      judgeGuard(
        loadConfig({
          DATABASE_URL: process.env.DATABASE_URL,
          GENERATION_MODEL: 'gemini-3.1-flash-lite',
          JUDGE_MODEL: 'gemini-3.1-flash-lite',
        }),
      ),
    ).toMatch(/differ/);
  });

  it('JDG-05: reconciled provider_calls row with kind judge and purpose eval', async () => {
    const [employee] = await db()
      .insert(employees)
      .values({ email: `judge-${Date.now()}@omena.example`, name: 'Judge', passwordHash: 'x' })
      .returning();
    const result = await callJudge(
      claims,
      cfg(),
      async () => ({
        value: {
          verdicts: [
            { sentence: 1, label: 'supported', reason: 'fact' },
            { sentence: 2, label: 'supported', reason: 'passage' },
          ],
        },
        usage: { inputTokens: 12, outputTokens: 8 },
      }),
      employee!.id,
    );
    expect(result.error).toBe(false);
    const [row] = await db().select().from(providerCalls).where(eq(providerCalls.kind, 'judge'));
    expect(row).toMatchObject({ kind: 'judge', purpose: 'eval', status: 'ok', model: 'gemini-3-flash-preview' });
    expect(row?.costUsd).toBeTruthy();
    expect(JSON.stringify(row)).not.toMatch(/The account is on Basic/);
  });

  it('skips the judge call when every sentence is malformed', async () => {
    const before = await db().select().from(providerCalls);
    const result = await callJudge(splitClaims('Retry-After [S2, S5].', {}), cfg(), async () => {
      throw new Error('should not be called');
    });
    expect(result.error).toBe(false);
    expect(result.verdicts[0]?.label).toBe('malformed_citation');
    const after = await db().select().from(providerCalls);
    expect(after.length).toBe(before.length);
  });

  it('rethrows budget errors instead of reporting judge_error', async () => {
    const tight = loadConfig({
      DATABASE_URL: process.env.DATABASE_URL,
      JUDGE_MODEL: 'gemini-3-flash-preview',
      GENERATION_MODEL: 'gemini-3.1-flash-lite',
      DAILY_BUDGET_USD: '0.000001',
    });
    await expect(callJudge(claims, tight, async () => ({ value: {} }))).rejects.toBeInstanceOf(AppError);
  });
});
