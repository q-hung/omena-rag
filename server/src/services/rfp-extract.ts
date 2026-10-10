import { badRequest } from '../errors.ts';

export const MAX_QUESTIONS = 50;
export type ExtractedQuestion = { text: string; section: string | null };

// Q1: · 1. · 1) · 1.2.3 · a) · - * • +   (plain integers need a . or ) so "2024 revenue" isn't an item)
const ITEM = /^(?:Q\d+\s*[:.)]|\d+[.)]|\d+(?:\.\d+)+[.)]?|[A-Za-z][.)]|[-*•+])\s+(\S.*)$/;
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const isCaps = (s: string) => s.length <= 80 && /[A-Z]{3}/.test(s) && !/[a-z?]/.test(s);

export const normaliseSpace = (s: string) => s.replace(/\s+/g, ' ').trim();

// ponytail: an unindented continuation must start lowercase, else it's a new line; add an LLM pass only if real RFPs miss (OPT3-2).
/** EXT-02: deterministic, no LLM. Every text is a whitespace-normalised substring of `source` (EXT-04). */
export function extractQuestions(source: string): ExtractedQuestion[] {
  const out: ExtractedQuestion[] = [];
  const seen = new Set<string>();
  let section: string | null = null;
  let cur: { text: string; section: string | null } | null = null;

  const close = () => {
    if (cur) {
      const text = normaliseSpace(cur.text);
      const key = text.toLowerCase();
      if (text && !seen.has(key)) {
        seen.add(key);
        out.push({ text, section: cur.section });
      }
      cur = null;
    }
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const indented = /^(?:\s{2,}|\t)/.test(raw);
    if (!line) {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      section = normaliseSpace(heading[1]!);
      continue;
    }
    const item = indented ? null : ITEM.exec(line);
    if (item) {
      close();
      cur = { text: item[1]!, section };
    } else if (!indented && isCaps(line)) {
      close();
      section = line.replace(/:$/, '');
    } else if (cur && (indented || (!cur.text.endsWith('?') && !/^[A-Z]/.test(line)))) {
      cur.text += ` ${line}`;
    } else if (line.endsWith('?')) {
      close();
      cur = { text: line, section };
    } else {
      close();
    }
  }
  close();

  if (out.length > MAX_QUESTIONS) {
    throw badRequest('TOO_MANY_QUESTIONS', `Found ${out.length} questions; the limit is ${MAX_QUESTIONS}. Split the RFP.`);
  }
  return out;
}
