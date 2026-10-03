/** Minimal text PDFs for tests and the §6.4 fixtures. */

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function contentStream(text: string): string {
  if (!text.trim()) return '';
  const lines = wrap(escapePdf(text.replace(/\s+/g, ' ').trim()), 90);
  let y = 720;
  let ops = 'BT\n/F1 12 Tf\n';
  lines.forEach((line, i) => {
    ops += i === 0 ? `72 ${y} Td\n(${line}) Tj\n` : `0 -16 Td\n(${line}) Tj\n`;
    y -= 16;
  });
  return `${ops}ET`;
}

/** One page per string. Empty strings become blank pages (no text layer). */
export function buildPdf(pages: string[]): Buffer {
  const pageCount = pages.length || 1;
  const texts = pages.length ? pages : [''];
  const pageNums: number[] = [];
  const contentNums: number[] = [];
  let next = 4;
  for (let i = 0; i < pageCount; i++) {
    pageNums.push(next++);
    contentNums.push(next++);
  }

  const ref = (n: number) => `${n} 0 R`;
  const objects = new Map<number, string>();
  objects.set(1, `<< /Type /Catalog /Pages ${ref(2)} >>`);
  objects.set(2, `<< /Type /Pages /Kids [${pageNums.map(ref).join(' ')}] /Count ${pageCount} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (let i = 0; i < pageCount; i++) {
    const stream = contentStream(texts[i] ?? '');
    objects.set(
      pageNums[i]!,
      `<< /Type /Page /Parent ${ref(2)} /MediaBox [0 0 612 792] /Contents ${ref(contentNums[i]!)} /Resources << /Font << /F1 ${ref(3)} >> >> >>`,
    );
    objects.set(contentNums[i]!, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [0];
  const max = next - 1;
  for (let n = 1; n <= max; n++) {
    offsets[n] = Buffer.byteLength(out);
    out += `${n} 0 obj\n${objects.get(n)}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${max + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= max; n++) {
    out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer << /Size ${max + 1} /Root ${ref(1)} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'binary');
}
