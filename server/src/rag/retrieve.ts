import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { isoDate } from '../lib/format.ts';
import { rowsOf } from '../db/rows.ts';

// REQ §7.2, RET-01/02. The access filter lives in SQL.

export type Passage = {
  chunkId: number;
  text: string;
  heading: string | null;
  pageNumber: number | null;
  versionId: number;
  versionNumber: number;
  effectiveAt: string;
  documentId: number;
  title: string;
  category: string;
  score: number;
  s: number;
  scriptKey?: string;
};

export type RetrieveOpts = {
  model: string;
  minScore: number;
  limit?: number;
  lexicalQuery?: string;
};

export async function retrieve(queryEmbedding: number[], opts: RetrieveOpts): Promise<Passage[]> {
  const limit = opts.limit ?? 8;
  const rows = opts.lexicalQuery
    ? await loadEligible(opts.model)
    : await loadByVector(queryEmbedding, opts.model, limit);

  const scored: Record<string, unknown>[] = opts.lexicalQuery
    ? rows
        .map((row) => ({ ...row, score: tokenOverlap(opts.lexicalQuery!, chunkText(row)) }))
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, limit)
    : rows;

  const kept: Passage[] = [];
  for (const row of scored) {
    const score = Number(row.score);
    if (!(score >= opts.minScore)) {
      continue;
    }
    const heading = row.heading == null ? null : String(row.heading);
    const pageNumber = row.page_number == null ? null : Number(row.page_number);
    const title = String(row.title);
    kept.push({
      chunkId: Number(row.id),
      text: String(row.text),
      heading,
      pageNumber,
      versionId: Number(row.version_id),
      versionNumber: Number(row.version_number),
      effectiveAt: isoDate(String(row.effective_at)),
      documentId: Number(row.document_id),
      title,
      category: String(row.category),
      score,
      s: kept.length + 1,
      scriptKey: scriptKeyFor(title, heading, pageNumber),
    });
  }
  return kept;
}

type SectionRule = { heading: RegExp; key: string; page?: number };
type DocumentRule = { title: RegExp; sections: SectionRule[] };

// First matching title wins, then its first matching section. A PDF section
// may match by page when its heading wasn't extracted.
const SCRIPT_RULES: DocumentRule[] = [
  {
    title: /plan comparison/i,
    sections: [
      { heading: /^basic$/i, key: 'plans:a' },
      { heading: /^pro$/i, key: 'plans:b' },
      { heading: /^enterprise$/i, key: 'plans:c' },
    ],
  },
  {
    title: /refund/i,
    sections: [
      { heading: /monthly/i, key: 'refund:a' },
      { heading: /annual/i, key: 'refund:b' },
      { heading: /processing/i, key: 'refund:c' },
      { heading: /exception/i, key: 'refund:d' },
    ],
  },
  {
    title: /faq/i,
    sections: [{ heading: /how long/i, key: 'faq:a' }],
  },
  {
    title: /region|payment methods/i,
    sections: [
      { heading: /countries|supported/i, key: 'regions:a' },
      { heading: /currenc/i, key: 'regions:b' },
      { heading: /declined/i, key: 'regions:c' },
    ],
  },
  {
    title: /sso/i,
    sections: [
      { heading: /requirement/i, page: 1, key: 'sso:a' },
      { heading: /enable/i, page: 3, key: 'sso:b' },
    ],
  },
  {
    title: /webhook/i,
    sections: [
      { heading: /^availability$/i, key: 'webhooks:a' },
      { heading: /create an endpoint/i, key: 'webhooks:b' },
      { heading: /authentication/i, key: 'webhooks:c' },
      { heading: /timeout/i, key: 'webhooks:d' },
      { heading: /\btls\b/i, key: 'webhooks:e' },
      { heading: /disabl/i, key: 'webhooks:f' },
    ],
  },
];

export function scriptKeyFor(title: string, heading: string | null, page: number | null): string | undefined {
  const doc = SCRIPT_RULES.find((rule) => rule.title.test(title));
  const h = (heading ?? '').trim();
  return doc?.sections.find((rule) => rule.heading.test(h) || rule.page === page)?.key;
}

async function loadByVector(queryEmbedding: number[], model: string, limit: number) {
  const vec = vectorLiteral(queryEmbedding);
  return rowsOf(
    await db().execute(sql`
      select c.id, c.text, c.heading, c.page_number, v.id as version_id, v.version_number,
             v.effective_at, d.id as document_id, d.title, d.category,
             1 - (c.embedding <=> ${vec}::vector) as score
      from document_chunks c
      join document_versions v on v.id = c.version_id
      join documents d on d.active_version_id = v.id and d.archived_at is null
      where c.embedding_model = ${model}
      order by c.embedding <=> ${vec}::vector
      limit ${limit}
    `),
  );
}

async function loadEligible(model: string) {
  return rowsOf(
    await db().execute(sql`
      select c.id, c.text, c.heading, c.page_number, v.id as version_id, v.version_number,
             v.effective_at, d.id as document_id, d.title, d.category,
             0 as score
      from document_chunks c
      join document_versions v on v.id = c.version_id
      join documents d on d.active_version_id = v.id and d.archived_at is null
      where c.embedding_model = ${model}
    `),
  );
}

function chunkText(row: Record<string, unknown>): string {
  return `${row.title ?? ''} ${row.heading ?? ''} ${row.text ?? ''}`;
}

const STOP = new Set([
  'why', 'is', 'this', 'the', 'a', 'an', 'to', 'on', 'in', 'for', 'and', 'or', 'of',
  'can', 'how', 'what', 'when', 'my', 'we', 'are', 'do', 'does', 'not',
]);

function tokensOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !STOP.has(t));
}

function tokenOverlap(query: string, text: string): number {
  const q = [...new Set(tokensOf(query))];
  if (!q.length) {
    return 0;
  }
  const words = new Set(tokensOf(text));
  let hit = 0;
  for (const token of q) {
    if (words.has(token) || [...words].some((w) => stemEq(token, w))) {
      hit += 1;
    }
  }
  return hit / q.length;
}

function stemEq(a: string, b: string): boolean {
  return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function vectorLiteral(values: number[]): string {
  if (!values.length || values.some((n) => !Number.isFinite(n))) {
    throw new Error('Query embedding is invalid.');
  }
  return `[${values.join(',')}]`;
}
