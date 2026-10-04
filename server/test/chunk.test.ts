import { describe, expect, it } from 'vitest';
import { chunk } from '../src/chunk.ts';
import { extractMarkdown } from '../src/extract/markdown.ts';

const asMd = (source: string) => ({
  kind: 'md' as const,
  pages: [],
  sections: extractMarkdown(source),
  warnings: [],
  pageCount: 0,
});

describe('chunker', () => {
  it('splits a 3,000-character section on a blank line', () => {
    const first = 'alpha '.repeat(250).trim();
    const second = 'bravo '.repeat(250).trim();
    expect(first.length).toBeGreaterThan(1400);
    const pieces = chunk(asMd(`# Section\n\n${first}\n\n${second}`));
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces[0]!.text).toBe(first);
    expect(pieces[1]!.text).toBe(second);
    expect(pieces.every((p) => p.heading === 'Section')).toBe(true);
  });

  it('leaves markdown syntax in the section body', () => {
    const [section] = extractMarkdown([
      '# Create an API key',
      '',
      '- **Read only** — customers.',
      '',
      '| Plan | Requests per minute |',
      '|---|---|',
      '| Pro | 100 |',
      '',
      '```',
      'Authorization: Bearer sp_live_...',
      '```',
    ].join('\n'));
    expect(section.heading).toBe('Create an API key');
    expect(section.text).toContain('**Read only**');
    expect(section.text).toContain('| Plan | Requests per minute |');
    expect(section.text).toContain('```');
    expect(section.text).toContain('Authorization: Bearer');
  });

  it('joins nested headings as "A > B"', () => {
    const pieces = chunk(asMd('# A\n\n## B\n\nNested body.\n'));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.heading).toBe('A > B');
    expect(pieces[0]!.text).toBe('Nested body.');
  });
});
