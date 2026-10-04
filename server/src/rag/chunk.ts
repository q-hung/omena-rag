import type { ExtractResult } from '../ingest/extract/run.ts';

export const TOKEN_TARGET = 500;
const maxChars = TOKEN_TARGET * 4;

export type Chunk = { heading: string | null; pageNumber: number | null; text: string };

const tokens = (text: string) => Math.ceil(text.length / 4);

function splitOversized(text: string, heading: string | null, pageNumber: number | null): Chunk[] {
  if (tokens(text) <= TOKEN_TARGET) {
    return [{ heading, pageNumber, text }];
  }
  const parts = text.split(/\n\n+/);
  const out: Chunk[] = [];
  let buf = '';
  const flush = () => {
    const piece = buf.trim();
    if (piece) {
      out.push({ heading, pageNumber, text: piece });
    }
    buf = '';
  };
  for (const part of parts) {
    if (!buf) {
      buf = part;
      continue;
    }
    if (tokens(`${buf}\n\n${part}`) <= TOKEN_TARGET) {
      buf = `${buf}\n\n${part}`;
    } else {
      flush();
      buf = part;
    }
  }
  flush();
  return out.flatMap((chunk) => {
    if (tokens(chunk.text) <= TOKEN_TARGET) {
      return [chunk];
    }
    const hard: Chunk[] = [];
    for (let i = 0; i < chunk.text.length; i += maxChars) {
      hard.push({ heading, pageNumber, text: chunk.text.slice(i, i + maxChars).trim() });
    }
    return hard.filter((c) => c.text);
  });
}

export function chunk(extracted: ExtractResult): Chunk[] {
  if (extracted.kind === 'pdf') {
    return extracted.pages.flatMap((page) => splitOversized(page.text, null, page.page));
  }
  return extracted.sections.flatMap((section) =>
    splitOversized(section.text, section.path || section.heading || null, null),
  );
}
