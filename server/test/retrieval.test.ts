import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { documentChunks, documentVersions, documents } from '../src/db/schema.ts';
import { utcToday } from '../src/lib/format.ts';
import { retrieve, rrf } from '../src/rag/retrieve.ts';
import { seedEmployees } from '../src/seed.ts';
import { queueDocument, queueVersion } from '../src/services/document-upload.service.ts';

const MODEL = 'gemini-embedding-2';
const axis = (i: number, value = 1) => {
  const v = new Array<number>(768).fill(0);
  v[i] = value;
  return v;
};

let employeeId: number;

beforeAll(async () => {
  const [ada] = await seedEmployees(db(), 'test-password');
  employeeId = ada!.id;
});

async function addDoc(
  title: string,
  embedding: number[],
  extras: { archived?: boolean; model?: string; superseded?: boolean } = {},
) {
  const created = await queueDocument({
    title,
    category: 'FAQ',
    effectiveAt: utcToday(),
    filename: `${title}.md`,
    bytes: Buffer.from(`# ${title}\ntext\n`, 'utf8'),
    employeeId,
  });
  await db()
    .update(documentVersions)
    .set({ indexingStatus: 'ready' })
    .where(eq(documentVersions.id, created.version.id));
    await db().insert(documentChunks).values({
    versionId: created.version.id,
    chunkIndex: 0,
    heading: title,
    pageNumber: null,
    text: extras.superseded ? `hidden ${title}` : `active ${title}`,
    embedding,
    embeddingModel: extras.model ?? MODEL,
  });
  if (extras.superseded) {
    const next = await queueVersion(created.document.id, {
      effectiveAt: utcToday(),
      filename: `${title}-v2.md`,
      bytes: Buffer.from(`# ${title} v2\nactive\n`, 'utf8'),
      employeeId,
    });
    await db()
      .update(documentVersions)
      .set({ indexingStatus: 'ready' })
      .where(eq(documentVersions.id, next.version.id));
    await db()
      .update(documents)
      .set({ activeVersionId: next.version.id })
      .where(eq(documents.id, created.document.id));
    await db().insert(documentChunks).values({
      versionId: next.version.id,
      chunkIndex: 0,
      heading: `${title} v2`,
      pageNumber: null,
      text: `active ${title}`,
      embedding: axis(5),
      embeddingModel: MODEL,
    });
  } else {
    await db()
      .update(documents)
      .set({ activeVersionId: created.version.id })
      .where(eq(documents.id, created.document.id));
  }
  if (extras.archived) {
    await db().update(documents).set({ archivedAt: new Date() }).where(eq(documents.id, created.document.id));
  }
  return created.document.id;
}

describe('retrieval', () => {
  it('returns top 8 by cosine score and drops rows below the threshold', async () => {
    await addDoc('high', axis(0));
    await addDoc('low', axis(1));

    const hits = await retrieve(axis(0), { model: MODEL, minScore: 0.5 });
    expect(hits.every((p) => p.score >= 0.5)).toBe(true);
    expect(hits.some((p) => p.text.includes('high'))).toBe(true);
    expect(hits.some((p) => p.text.includes('low'))).toBe(false);
  });

  it('never returns a superseded version, an archived document or another embedding model', async () => {
    await addDoc('superseded', axis(2), { superseded: true });
    await addDoc('archived', axis(2), { archived: true });
    await addDoc('other-model', axis(2), { model: 'other-embed' });
    await addDoc('visible', axis(2));

    const hits = await retrieve(axis(2), { model: MODEL, minScore: 0.1 });
    expect(hits.map((p) => p.title)).toEqual(['visible']);
    expect(hits[0]!.text).toBe('active visible');
    expect(hits.some((p) => p.text.startsWith('hidden'))).toBe(false);
  });

  it('treats zero rows as a valid result', async () => {
    expect(await retrieve(axis(7), { model: MODEL, minScore: 0.99 })).toEqual([]);
  });
});

describe('hybrid retrieval (REQ_V2 §7.7)', () => {
  // minScore 0.99 on an orthogonal vector empties the vector list, leaving the lexical list alone.
  const lexicalOnly = (queryText: string) =>
    retrieve(axis(100), { model: MODEL, minScore: 0.99, mode: 'hybrid', queryText });

  it('HYB-02: rrf rewards presence in both lists, breaks ties by id and caps the output', () => {
    expect(rrf([[1, 2], [2, 3]]).map((r) => r.id)).toEqual([2, 1, 3]);
    expect(rrf([[9], [4]]).map((r) => r.id)).toEqual([4, 9]);
    expect(rrf([Array.from({ length: 20 }, (_, i) => i)]).length).toBe(8);
    expect(rrf([[7]])[0]!.score).toBeCloseTo(1 / 61);
  });

  it('HYB-03: OR semantics match a natural question; stop words alone give an empty list', async () => {
    await addDoc('Webhooks guide', axis(10));
    const hits = await lexicalOnly("Why is this account's webhook failing?");
    expect(hits.map((p) => p.title)).toEqual(['Webhooks guide']);
    expect(await lexicalOnly('why is this the')).toEqual([]);
  });

  it('HYB-01: filters match vector mode for a chunk containing the exact term', async () => {
    await addDoc('zebrafish superseded', axis(11), { superseded: true });
    await addDoc('zebrafish archived', axis(11), { archived: true });
    await addDoc('zebrafish other-model', axis(11), { model: 'other-embed' });
    const hits = await lexicalOnly('zebrafish');
    expect(hits.some((p) => p.text.startsWith('hidden'))).toBe(false);
    expect(hits.map((p) => p.title)).toEqual(['zebrafish superseded']);
    expect(hits[0]!.text).toBe('active zebrafish superseded');
  });

  it('fuses both lists and stores the fused score', async () => {
    await addDoc('Alpha paraphrase', axis(20));
    await addDoc('Quokka token', axis(21));
    const hits = await retrieve(axis(20), { model: MODEL, minScore: 0.5, mode: 'hybrid', queryText: 'quokka' });
    expect(hits.map((p) => p.title).sort()).toEqual(['Alpha paraphrase', 'Quokka token']);
    expect(hits.every((p) => p.score < 0.05)).toBe(true);
  });

  it('HYB-04: vector mode is unchanged', async () => {
    await addDoc('Quokka vec', axis(30));
    const hits = await retrieve(axis(31), { model: MODEL, minScore: 0.5, mode: 'vector', queryText: 'quokka' });
    expect(hits).toEqual([]);
  });
});
