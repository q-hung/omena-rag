import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractQuestions, normaliseSpace } from '../src/services/rfp-extract.ts';

const texts = (s: string) => extractQuestions(s).map((q) => q.text);

describe('extractQuestions', () => {
  it('takes numbered, lettered, Q-prefixed and dotted items', () => {
    expect(texts('1. One?\n2) Two?\nQ3: Three?\na) Four?\n1.2.3 Five?')).toEqual([
      'One?', 'Two?', 'Three?', 'Four?', 'Five?',
    ]);
  });

  it('takes bullets and bare ?-terminated lines, ignores prose and bare years', () => {
    expect(texts('Intro text.\n- Bullet one\n* Bullet two\nDo you do X?\n2024 revenue was high.')).toEqual([
      'Bullet one', 'Bullet two', 'Do you do X?',
    ]);
  });

  it('joins continuation lines', () => {
    expect(texts('1. Describe your\nencryption approach?\n\n- Bullet\n  indented tail')).toEqual([
      'Describe your encryption approach?', 'Bullet indented tail',
    ]);
  });

  it('sets sections from markdown headings and ALL CAPS lines', () => {
    expect(extractQuestions('## Access\n1. A?\n\nBILLING TERMS:\n2. B?\n# Last\nC?')).toEqual([
      { text: 'A?', section: 'Access' },
      { text: 'B?', section: 'BILLING TERMS' },
      { text: 'C?', section: 'Last' },
    ]);
  });

  it('drops duplicates and empties', () => {
    expect(texts('1. Same?\n2. same?\n-  \n3. Other?')).toEqual(['Same?', 'Other?']);
  });

  it('rejects more than 50 questions', () => {
    const many = Array.from({ length: 51 }, (_, i) => `${i + 1}. Question ${i}?`).join('\n');
    expect(() => extractQuestions(many)).toThrowError(expect.objectContaining({ code: 'TOO_MANY_QUESTIONS' }));
  });

  it('EXT-04: every fixture question is a substring of the normalised source', () => {
    const source = readFileSync(new URL('../fixtures/rfp/vendor-security-questionnaire.md', import.meta.url), 'utf8');
    const questions = extractQuestions(source);
    expect(questions.length).toBeGreaterThanOrEqual(12);
    const norm = normaliseSpace(source);
    for (const q of questions) {
      expect(norm).toContain(q.text);
    }
    expect(questions.some((q) => q.section === 'Access and identity')).toBe(true);
    expect(questions.some((q) => q.section === 'PLATFORM AND API')).toBe(true);
  });
});
