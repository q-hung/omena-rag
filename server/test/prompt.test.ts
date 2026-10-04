import { beforeAll, describe, expect, it } from 'vitest';
import { buildAccountSnapshot } from '../src/services/account-context.service.ts';
import { db } from '../src/db/index.ts';
import { accounts, employees } from '../src/db/schema.ts';
import { PROMPT_VERSION, TOKEN_BUDGET, buildPrompt, estimateTokens } from '../src/rag/prompt.ts';
import type { Passage } from '../src/rag/retrieve.ts';
import { seed } from '../src/seed.ts';

const D = '2026-10-02';
const ids: Record<string, number> = {};

beforeAll(async () => {
  await seed(db(), { date: D, password: 'test-password' });
  for (const a of await db().select().from(accounts)) ids[a.ref] = a.id;
});

function passage(over: Partial<Passage> & { text: string; title?: string }): Passage {
  return {
    chunkId: over.chunkId ?? 1,
    heading: over.heading ?? 'Heading',
    pageNumber: over.pageNumber ?? null,
    versionId: over.versionId ?? 1,
    versionNumber: over.versionNumber ?? 1,
    effectiveAt: over.effectiveAt ?? D,
    documentId: over.documentId ?? 1,
    title: over.title ?? 'Plan comparison',
    category: over.category ?? 'Plans',
    score: over.score ?? 0.9,
    s: over.s ?? 1,
    scriptKey: over.scriptKey,
    text: over.text,
  };
}

describe('prompt', () => {
  it('keeps PRM-01 for every seed account', async () => {
    const staff = await db().select().from(employees);
    const forbidden = [
      ...staff.flatMap((e) => [e.name, e.email]),
      'Clara Studio',
      'Becker Bikes',
      'Orbit Meals',
      'Northwind Coffee',
      'Feira Box',
      'A-1001',
      'A-1002',
      'A-1003',
      'A-1004',
      'A-1005',
      'PAY-1101',
      'PAY-1201',
      'PAY-1303',
      'PAY-1401',
      'PAY-1502',
      'WH-1',
      'WH-2',
      'orders.orbit.example',
      'staging.orbit.example',
      'crm.northwind.example',
      'ops.northwind.example',
    ];
    const sample = passage({ text: 'SSO is on Enterprise only.' });
    for (const ref of Object.keys(ids)) {
      const snapshot = await buildAccountSnapshot(ids[ref], D);
      const { prompt } = buildPrompt({
        snapshot,
        passages: [sample],
        question: 'Why is SSO locked?',
      });
      expect(prompt).toContain(`prompt_version: ${PROMPT_VERSION}`);
      expect(prompt).toContain('One id per marker');
      expect(prompt).toContain('F1 |');
      expect(prompt).toContain('S1 |');
      expect(prompt).toContain('<untrusted>');
      for (const needle of forbidden) {
        expect(prompt, `${ref} leaked ${needle}`).not.toContain(needle);
      }
    }
  });

  it('drops the lowest-ranked passage when over the token budget', async () => {
    const snapshot = await buildAccountSnapshot(ids['A-1001'], D);
    const keep = 'keep '.repeat(4_000);
    const drop = 'drop '.repeat(8_000);
    const passages = [
      passage({ chunkId: 1, s: 1, title: 'Keep me', text: keep }),
      passage({ chunkId: 2, s: 2, title: 'Drop me', text: drop }),
    ];
    const { prompt, passages: kept } = buildPrompt({
      snapshot,
      passages,
      question: 'q',
    });
    expect(kept.map((p) => p.title)).toEqual(['Keep me']);
    expect(prompt).toContain('Keep me');
    expect(prompt).not.toContain('Drop me');
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(prompt).toContain('F1 |');
  });

  it('renders a clarification selection from the snapshot', async () => {
    const snapshot = await buildAccountSnapshot(ids['A-1003'], D);
    const f10 = snapshot.facts.find((f) => f.id === 'F10')!;
    const { prompt } = buildPrompt({
      snapshot,
      passages: [],
      turns: [
        {
          kind: 'question',
          text: 'Is this payment eligible for a refund?',
          clarifications: [{ kind: 'choose_record', prompt: 'Which payment?' }],
        },
        { kind: 'clarification_reply', text: 'The extra seats one', selectedFacts: ['F10'] },
      ],
      question: 'The extra seats one',
    });
    expect(prompt).toContain(`Employee selected: F10 — ${f10.value}`);
    expect(prompt).toContain('Clarification asked: Which payment?');
  });
});
