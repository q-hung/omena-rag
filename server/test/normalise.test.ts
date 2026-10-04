import { beforeAll, describe, expect, it } from 'vitest';
import { buildAccountSnapshot } from '../src/context.ts';
import { db } from '../src/db/index.ts';
import { accounts } from '../src/db/schema.ts';
import { I2_TEXT, normalise, stripMarkers } from '../src/normalise.ts';
import type { Passage } from '../src/retrieve.ts';
import { seed } from '../src/seed.ts';

const D = '2026-10-02';
let facts: Awaited<ReturnType<typeof buildAccountSnapshot>>['facts'];

beforeAll(async () => {
  await seed(db(), { date: D, password: 'test-password' });
  const rows = await db().select().from(accounts);
  const orbit = rows.find((a) => a.ref === 'A-1003')!;
  facts = (await buildAccountSnapshot(orbit.id, D)).facts;
});

function passage(s: number, extras: Partial<Passage> = {}): Passage {
  return {
    chunkId: extras.chunkId ?? s,
    text: extras.text ?? `passage ${s}`,
    heading: extras.heading ?? `H${s}`,
    pageNumber: extras.pageNumber ?? null,
    versionId: extras.versionId ?? s,
    versionNumber: 1,
    effectiveAt: D,
    documentId: extras.documentId ?? s,
    title: extras.title ?? `Doc ${s}`,
    category: extras.category ?? 'Policies',
    score: extras.score ?? 0.8,
    s,
    scriptKey: extras.scriptKey,
  };
}

const base = {
  outcome: 'answer' as const,
  answer: '',
  clarifications: [],
  gaps: [],
  conflicts: [],
  review_reasons: [],
};

describe('normalise', () => {
  it('splits grouped markers, keeps valid ids and flags unknown ones', () => {
    const result = normalise(
      { ...base, answer: 'x [S2, S5]. Also [F1, S3].' },
      { facts, passages: [passage(1), passage(2), passage(3)] },
    );
    expect(result.text).toBe('x [1]. Also [F1] [2].');
    expect(result.reviewReasons).toContain('invalid_citation_removed');
    expect(result.sources.map((s) => s.citationNumber)).toEqual([1, 2]);
    expect(stripMarkers(result.text)).not.toMatch(/\[/);
  });

  it('removes [S9] when only 3 passages were given and flags it', () => {
    const result = normalise(
      { ...base, answer: 'See [S1] and [S9].' },
      { facts, passages: [passage(1), passage(2), passage(3)] },
    );
    expect(result.text).toContain('[1]');
    expect(result.text).not.toMatch(/\[S9\]|\[9\]/);
    expect(result.reviewReasons).toContain('invalid_citation_removed');
    expect(result.sources.map((s) => s.citationNumber)).toEqual([1]);
  });

  it('gives an uncited conflict source the next number', () => {
    const result = normalise(
      {
        ...base,
        answer: 'Policy says five days [S1].',
        conflicts: [{ topic: 'refund processing time', sources: ['S1', 'S2'] }],
      },
      { facts, passages: [passage(1), passage(2)] },
    );
    expect(result.text).toContain('[1]');
    expect(result.conflicts).toEqual([{ topic: 'refund processing time', nums: ['1', '2'] }]);
    expect(result.reviewReasons).toContain('conflict');
    expect(result.sources.map((s) => s.citationNumber)).toEqual([1, 2]);
  });

  it('stores choose_record options from the snapshot and falls back to free_text', () => {
    const f10 = facts.find((f) => f.id === 'F10')!;
    const f11 = facts.find((f) => f.id === 'F11')!;
    const kept = normalise(
      {
        ...base,
        outcome: 'clarification_required',
        answer: '',
        clarifications: [{ kind: 'choose_record', prompt: 'Which payment?', options: ['F11', 'F10', 'F99'] }],
      },
      { facts, passages: [] },
    );
    expect(kept.clarifications).toEqual([
      {
        kind: 'choose_record',
        prompt: 'Which payment?',
        options: [
          { fact: 'F11', label: f11.value },
          { fact: 'F10', label: f10.value },
        ],
      },
    ]);

    const fallback = normalise(
      {
        ...base,
        outcome: 'clarification_required',
        answer: '',
        clarifications: [{ kind: 'choose_record', prompt: 'Which payment?', options: ['F10'] }],
      },
      { facts, passages: [] },
    );
    expect(fallback.clarifications).toEqual([{ kind: 'free_text', question: 'Which payment?' }]);
  });

  it('gives [S2] in a free_text question the next number and an answer_sources row', () => {
    const result = normalise(
      {
        ...base,
        outcome: 'clarification_required',
        answer: 'The first payment is [F10] [S1].',
        clarifications: [{ kind: 'free_text', question: 'Does [S2] apply?' }],
      },
      { facts, passages: [passage(1), passage(2)] },
    );
    expect(result.text).toContain('[1]');
    expect(result.clarifications).toEqual([{ kind: 'free_text', question: 'Does [2] apply?' }]);
    expect(result.sources.map((s) => [s.citationNumber, s.chunkId])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('turns a third clarification into insufficient_evidence with the I2 text', () => {
    const result = normalise(
      {
        ...base,
        outcome: 'clarification_required',
        answer: '',
        clarifications: [{ kind: 'free_text', question: 'Which invoice?' }],
        review_reasons: ['made_up' as unknown as 'policy_applicability'],
      },
      { facts, passages: [], clarificationRounds: 2 },
    );
    expect(result.outcome).toBe('insufficient_evidence');
    expect(result.text).toBe(I2_TEXT);
    expect(result.clarifications).toEqual([]);
    expect(result.gaps).toEqual([{ kind: 'user_input', detail: 'Which invoice?' }]);
    expect(result.reviewReasons).not.toContain('made_up');
    expect(result.text.trim().length).toBeGreaterThan(0);
  });

  it('downgrades an uncited answer and keeps model review reasons from the enum', () => {
    const result = normalise(
      { ...base, answer: 'No markers.', review_reasons: ['policy_applicability'] },
      { facts, passages: [passage(1)] },
    );
    expect(result.outcome).toBe('insufficient_evidence');
    expect(result.reviewReasons).toEqual(expect.arrayContaining(['policy_applicability', 'no_valid_citation']));
  });

  it('drops unusable clarifications on any outcome, never storing null', () => {
    const result = normalise(
      {
        ...base,
        answer: 'Pro plan [S1].',
        clarifications: [{ kind: 'choose_record', prompt: ' ', options: ['F999'] }],
      },
      { facts, passages: [passage(1)] },
    );
    expect(result.outcome).toBe('answer');
    expect(result.clarifications).toEqual([]);
  });
});
