import type { Fact } from './context.ts';
import type { ModelOutput } from './llm/schema.ts';
import type { Passage } from './retrieve.ts';

// REQ §9.3, NRM-01, I2, I3.

export const I2_TEXT =
  "Essential information is still missing after two clarification rounds, so this can't be answered from the available sources.";

const MODEL_REASONS = new Set(['policy_applicability', 'exception_unclear']);
const MARKER = /\[(?:(F|S):([^\]]+)|(F|S)(\d+))\]/g;
const GROUPED = /\[((?:[FS]\d+)(?:\s*[,;]\s*(?:[FS]\d+))+)\]/g;

function expandGroupedMarkers(text: string): string {
  return text.replace(GROUPED, (_full, inner: string) =>
    inner.split(/\s*[,;]\s*/).map((id) => `[${id}]`).join(''),
  );
}

export type CitedSource = {
  citationNumber: number;
  chunkId: number;
  rank: number;
  score: number;
  passage: Passage;
};

export type Clarification =
  | { kind: 'choose_record'; prompt: string; options: { fact: string; label: string }[] }
  | { kind: 'free_text'; question: string };

export type Normalised = {
  outcome: ModelOutput['outcome'];
  text: string;
  clarifications: Clarification[];
  gaps: { kind: 'no_record' | 'documentation' | 'user_input'; detail: string }[];
  conflicts: { topic: string; nums: string[] }[];
  reviewReasons: string[];
  sources: CitedSource[];
};

export function stripMarkers(text: string): string {
  return expandGroupedMarkers(text)
    .replace(/ ?\[(?:F\d+|\d+|S\d+)\]/g, '')
    .replace(/ ?\[(?:F|S):[^\]]+\]/g, '');
}

export function normalise(
  raw: ModelOutput,
  opts: { facts: Fact[]; passages: Passage[]; clarificationRounds?: number },
): Normalised {
  const reasons = new Set<string>((raw.review_reasons ?? []).filter((r) => MODEL_REASONS.has(r)));
  const facts = opts.facts;
  const passages = opts.passages;
  const factById = new Map(facts.map((f) => [f.id, f]));
  const factByKey = new Map(facts.map((f) => [f.key, f]));
  const passageByS = new Map(passages.map((p) => [p.s, p]));
  const passageByKey = new Map(passages.filter((p) => p.scriptKey).map((p) => [p.scriptKey!, p]));

  const ordered: Passage[] = [];
  const numOf = new Map<number, number>();
  const cite = (passage: Passage | undefined): number | null => {
    if (!passage) return null;
    const existing = numOf.get(passage.chunkId);
    if (existing) return existing;
    const n = ordered.length + 1;
    ordered.push(passage);
    numOf.set(passage.chunkId, n);
    return n;
  };

  const resolvePassage = (token: string): Passage | undefined => {
    if (/^\d+$/.test(token)) return passageByS.get(Number(token));
    if (/^S\d+$/i.test(token)) return passageByS.get(Number(token.slice(1)));
    return passageByKey.get(token) ?? passageByKey.get(token.replace(/^S:/, ''));
  };

  const resolveFact = (token: string): string | null => {
    const id = token.startsWith('F') ? token : `F${token}`;
    if (factById.has(id)) return id;
    return factByKey.get(token)?.id ?? factByKey.get(token.replace(/^F:/, ''))?.id ?? null;
  };

  const resolve = (text = ''): string =>
    expandGroupedMarkers(text)
      .replace(MARKER, (_full, typed: string | undefined, key: string | undefined, kind: string | undefined, digits: string | undefined) => {
        const which = typed ?? kind;
        const token = key ?? digits ?? '';
        if (which === 'F') {
          const id = resolveFact(token);
          if (!id) {
            reasons.add('invalid_citation_removed');
            return '';
          }
          return ` [${id}]`;
        }
        const n = cite(resolvePassage(token));
        if (!n) {
          reasons.add('invalid_citation_removed');
          return '';
        }
        return ` [${n}]`;
      })
      .replace(/[ \t]+\n/g, '\n')
      .replace(/ {2,}/g, ' ');

  let text = resolve(raw.answer);
  const conflicts = (raw.conflicts ?? [])
    .map((c) => ({
      topic: c.topic,
      nums: c.sources.map((src) => cite(resolvePassage(src.replace(/^\[|\]$/g, '')))).filter((n): n is number => n != null),
    }))
    .filter((c) => c.nums.length > 1);

  if (conflicts.length) reasons.add('conflict');

  const gaps = [...(raw.gaps ?? [])];
  let outcome = raw.outcome;
  let clarifications = (raw.clarifications ?? [])
    .map((c) => shapeClarification(c, facts, resolve))
    .filter((c): c is Clarification => c != null);

  if (outcome === 'answer' && (!text.trim() || !/\[(?:F\d+|\d+)\]/.test(text))) {
    outcome = 'insufficient_evidence';
    reasons.add('no_valid_citation');
  }

  if (outcome === 'clarification_required') {
    if (!clarifications.length) outcome = 'insufficient_evidence';
    else if ((opts.clarificationRounds ?? 0) >= 2) {
      outcome = 'insufficient_evidence';
      gaps.push(
        ...clarifications.map((c) => ({
          kind: 'user_input' as const,
          detail: stripMarkers(c.kind === 'free_text' ? c.question : c.prompt),
        })),
      );
      text = I2_TEXT;
      clarifications = [];
    } else {
      clarifications = clarifications.slice(0, 2);
    }
  }

  const sources: CitedSource[] = ordered.map((passage, i) => ({
    citationNumber: i + 1,
    chunkId: passage.chunkId,
    rank: i + 1,
    score: passage.score,
    passage,
  }));

  return {
    outcome,
    text: text.trim(),
    clarifications,
    gaps,
    conflicts: conflicts.map((c) => ({ topic: c.topic, nums: c.nums.map(String) })),
    reviewReasons: [...reasons],
    sources,
  };
}

function shapeClarification(
  raw: ModelOutput['clarifications'][number],
  facts: Fact[],
  resolve: (text: string) => string,
): Clarification | null {
  if (raw.kind === 'free_text') {
    const question = resolve(raw.question).trim();
    return question ? { kind: 'free_text', question } : null;
  }

  const byId = new Map(facts.map((f) => [f.id, f]));
  const valid: Fact[] = [];
  for (const option of raw.options) {
    const id = option.startsWith('F') ? option : `F${option}`;
    const fact = byId.get(id);
    if (!fact) continue;
    if (!valid.length || fact.section === valid[0]!.section) valid.push(fact);
    if (valid.length === 4) break;
  }
  if (valid.length >= 2) {
    return {
      kind: 'choose_record',
      prompt: raw.prompt,
      options: valid.map((f) => ({ fact: f.id, label: f.value })),
    };
  }
  if (!raw.prompt.trim()) return null;
  return { kind: 'free_text', question: resolve(raw.prompt).trim() };
}
