import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../src/rag/prompt.ts';
import { buildRfpPrompt, RFP_PROMPT_VERSION } from '../src/rag/rfp-prompt.ts';
import type { Passage } from '../src/rag/retrieve.ts';

const D = '2026-10-02';

function passage(over: Partial<Passage> & { text: string }): Passage {
  return {
    chunkId: over.chunkId ?? 1,
    heading: over.heading ?? 'Heading',
    pageNumber: over.pageNumber ?? null,
    versionId: over.versionId ?? 1,
    versionNumber: over.versionNumber ?? 1,
    effectiveAt: over.effectiveAt ?? D,
    documentId: over.documentId ?? 1,
    title: over.title ?? 'SSO guide',
    category: over.category ?? 'Security',
    score: over.score ?? 0.9,
    s: over.s ?? 1,
    scriptKey: over.scriptKey,
    text: over.text,
  };
}

describe('buildRfpPrompt', () => {
  it('versions the instructions and renumbers passages S1..Sk', () => {
    const { prompt, passages, promptVersion } = buildRfpPrompt({
      question: 'Do you support SAML SSO?',
      passages: [passage({ text: 'We support SAML 2.0.', s: 5 }), passage({ chunkId: 2, text: 'And SCIM.', s: 9 })],
    });
    expect(promptVersion).toBe(RFP_PROMPT_VERSION);
    expect(prompt).toContain(`prompt_version: ${RFP_PROMPT_VERSION}`);
    expect(prompt).toContain('S1 | SSO guide | Security | v1');
    expect(prompt).toContain('S2 | SSO guide | Security | v1');
    expect(passages.map((p) => p.s)).toEqual([1, 2]);
  });

  it('delimits the question and its section as untrusted', () => {
    const { prompt } = buildRfpPrompt({
      question: 'Do you support SAML SSO?',
      section: 'Security',
      passages: [passage({ text: 'We support SAML 2.0.' })],
    });
    expect(prompt).toContain('<untrusted>');
    expect(prompt).toContain('Section: Security');
    expect(prompt).toContain('Do you support SAML SSO?');
    expect(prompt).toContain('</untrusted>');
  });

  it('marks the question untrusted even without a section', () => {
    const { prompt } = buildRfpPrompt({ question: 'What is your uptime SLA?', passages: [] });
    expect(prompt).toContain('<untrusted>');
    expect(prompt).not.toContain('Section:');
  });

  it('drops the lowest-ranked passages when over the 6,000-token budget', () => {
    const big = 'word '.repeat(3_000);
    const { prompt, passages } = buildRfpPrompt({
      question: 'Describe your security program.',
      passages: [
        passage({ chunkId: 1, text: `TOPRANKED ${big}` }),
        passage({ chunkId: 2, text: `LOWRANKED ${big}` }),
      ],
    });
    expect(passages).toHaveLength(1);
    expect(passages[0]!.chunkId).toBe(1);
    expect(prompt).toContain('TOPRANKED');
    expect(prompt).not.toContain('LOWRANKED');
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(6_000);
  });

  it('carries no employee name or email, only the question and section (RFP-PRM-01)', () => {
    const { prompt } = buildRfpPrompt({
      question: 'Do you support SAML SSO?',
      section: 'Identity',
      passages: [passage({ text: 'We support SAML 2.0.' })],
    });
    expect(prompt).not.toMatch(/@/);
    expect(prompt).not.toMatch(/employee|created_by|rfp_id/i);
  });
});
