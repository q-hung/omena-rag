const ABBREV = /\b(e\.g|i\.e|vs)\./gi;
const VALID_MARKER = /^\[(?:F\d+|\d+)\]$/;
const ANY_MARKER = /\[[^\]]+\]/g;
const FACT_MARKER = /^\[F(\d+)\]$/;
const PASSAGE_MARKER = /^\[(\d+)\]$/;

export type ClaimSources = {
  facts: Record<string, string>;
  passages: Record<string, string>;
};

export type Claim = {
  n: number;
  text: string;
  cited: string;
  malformed: boolean;
};

const ONLY_MARKERS = /^(?:\[[^\]]+\]\s*)+$/;

export function splitSentences(text: string): string[] {
  const protectedText = text.replace(ABBREV, (s) => s.replaceAll('.', '\0'));
  const parts = protectedText
    .split(/(?<=[.!?])(?:\s+|\n+)+/)
    .map((s) => s.replaceAll('\0', '.').trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length && ONLY_MARKERS.test(part)) {
      merged[merged.length - 1] += ` ${part}`;
    } else {
      merged.push(part);
    }
  }
  return merged;
}

export function splitClaims(text: string, sources: Partial<ClaimSources> = {}): Claim[] {
  const facts = sources.facts ?? {};
  const passages = sources.passages ?? {};
  return splitSentences(text).map((sentence, i) => {
    const markers = sentence.match(ANY_MARKER) ?? [];
    const malformed = markers.some((m) => !VALID_MARKER.test(m));
    const cited = malformed
      ? ''
      : markers
          .map((m) => {
            const fact = m.match(FACT_MARKER);
            if (fact) {
              return `[F${fact[1]}] ${facts[`F${fact[1]}`] ?? ''}`;
            }
            const passage = m.match(PASSAGE_MARKER);
            if (passage) {
              return `[${passage[1]}] ${passages[passage[1]!] ?? ''}`;
            }
            return m;
          })
          .join('\n');
    return { n: i + 1, text: sentence, cited, malformed };
  });
}
