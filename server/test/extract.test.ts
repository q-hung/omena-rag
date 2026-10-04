import { describe, expect, it } from 'vitest';
import { extract } from '../src/ingest/extract.ts';
import { buildPdf } from '../src/ingest/extract/pdfBytes.ts';

const THREE_PAGE = buildPdf([
  'SAML single sign-on is available on the Enterprise plan.',
  '',
  'Go to Settings → Security → Single sign-on and upload the metadata.',
]);
const IMAGE_ONLY = buildPdf(['']);

describe('extractors', () => {
  it('indexes pages 1 and 3 of a 3-page PDF and warns about the blank page', async () => {
    const result = await extract(THREE_PAGE, 'sso.pdf');
    expect(result.kind).toBe('pdf');
    expect(result.pages.map((p) => p.page)).toEqual([1, 3]);
    expect(result.pages[0]!.text).toMatch(/Enterprise/);
    expect(result.pages[1]!.text).toMatch(/Single sign-on/);
    expect(result.warnings.join(' ')).toMatch(/page 2/i);
  });

  it('fails an image-only PDF with the OCR message', async () => {
    await expect(extract(IMAGE_ONLY, 'scan.pdf')).rejects.toThrow(
      "No page has a text layer. OCR isn't supported.",
    );
  });

  it('kills a hanging extractor', async () => {
    await expect(
      extract(Buffer.from('# hi\n'), 'hang.md', { timeoutMs: 400, extra: { hang: true } }),
    ).rejects.toThrow('Extraction timed out.');
  });

  it("starts the child with an empty process.env", async () => {
    const { spawn } = await import('node:child_process');
    const { join } = await import('node:path');
    const child = spawn(process.execPath, [join(import.meta.dirname, '../src/ingest/extract-child.ts')], {
      env: {},
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end(JSON.stringify({ probe: 'env' }));
    const out: Buffer[] = [];
    for await (const chunk of child.stdout) out.push(chunk);
    const parsed = JSON.parse(Buffer.concat(out).toString()) as { env: NodeJS.ProcessEnv };
    expect(parsed.env).toEqual({});
  });

  it('does not treat a # inside a fence as a heading', async () => {
    const md = ['# Real heading', '', '```', '# not a heading', '```', '', 'Body text.'].join('\n');
    const result = await extract(Buffer.from(md, 'utf8'), 'fences.md');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.path).toBe('Real heading');
    expect(result.sections[0]!.text).toContain('# not a heading');
    expect(result.sections.map((s) => s.heading)).not.toContain('not a heading');
  });
});
