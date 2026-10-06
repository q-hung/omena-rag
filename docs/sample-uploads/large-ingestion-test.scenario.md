# Scenario: large-document ingestion and vector generation

Covers B05 (batched embeddings). Fixture: `large-ingestion-test.md` in this folder. About 17k words, roughly 30 pages. It indexes to **131 chunks** (1 intro + 26 chapters × 5 sections), so it needs **2 embed batches** (100 + 31).

Canary facts sit at chunk indexes chosen around the batch boundary:

| Chunk index | Position | Canary phrase | Answer |
|---|---|---|---|
| 1 | first section | Nordic Freeze Code | HELSINKI-4471 |
| 51 | middle, batch 1 | Midpoint Escalation Word | PELICAN-2208 |
| 99 | last of batch 1 | Last Batch One Phrase | MARIGOLD-7315 |
| 100 | first of batch 2 | Batch Two Opener | TUNDRA-9042 |
| 101 | second of batch 2 | Batch Two Follower | GLACIER-1187 |
| 130 | last chunk | Final Chunk Token | LIGHTHOUSE-5560 |

If a batch-2 chunk inherited a wrong vector, its canary question would retrieve the wrong passage or none.

## Setup

```bash
docker compose up -d db
pnpm db:migrate && pnpm seed
pnpm worker
```

Run the scenario once with `LLM_PROVIDER=stub` (free, keyword retrieval) and once with `LLM_PROVIDER=gemini` (real vectors, needs `GEMINI_API_KEY`). Only the Gemini run proves real vector generation.

## Steps

1. Sign in, open the documents page, upload `large-ingestion-test.md`.
2. Watch the version go `queued` → `processing` → `ready`. Expect under a minute on Gemini.
3. Run the SQL checks below.
4. Ask the canary questions (below) against any account and check the cited passage.
5. Re-upload the same file as a new version. Expect version 2 to become active and version 1's chunks to stay untouched.
6. Failure case: stop the worker mid-run (or set a bad `GEMINI_API_KEY`) and confirm the version ends `failed` with no chunks inserted.

## SQL checks

```sql
-- chunk count and uniqueness (expect 131, 131, 131)
select count(*), count(distinct chunk_index), count(distinct text)
from document_chunks where version_id = :vid;

-- every chunk has its own vector (expect 131 distinct; a repeated vector means B05 regressed)
select count(distinct embedding::text) from document_chunks where version_id = :vid;

-- one model for all chunks, expect a single row
select embedding_model, count(*) from document_chunks where version_id = :vid group by 1;

-- two paid embed calls, one per batch (expect 2 rows)
select id, status, input_tokens, cost_usd from provider_calls
where kind = 'embed_document' and document_version_id = :vid order by id;

-- version state
select indexing_status, indexing_error, indexing_warnings, indexed_at
from document_versions where id = :vid;
```

Also check that the first chunk of batch 2 differs from the last of batch 1:

```sql
select chunk_index, left(text, 60), left(embedding::text, 40)
from document_chunks where version_id = :vid and chunk_index in (99, 100, 101);
```

## Canary questions

Ask each, expect the answer in the table and a citation of the matching chunk.

1. What is the Nordic Freeze Code? → HELSINKI-4471
2. What is the Midpoint Escalation Word for webhook retry reviews? → PELICAN-2208
3. What is the Last Batch One Phrase? → MARIGOLD-7315
4. What is the Batch Two Opener? → TUNDRA-9042
5. What is the Batch Two Follower? → GLACIER-1187
6. What is the Final Chunk Token? → LIGHTHOUSE-5560

Questions 4 to 6 are the ones that fail if batch 2 is mis-assigned.

## Pass criteria

- Version `ready`, no `indexing_error`.
- 131 chunks, 131 distinct vectors, one `embedding_model`.
- Exactly 2 `embed_document` rows in `provider_calls`.
- All 6 canary questions return the right phrase with the right citation.
- Failure run: status `failed`, 0 chunks for that version.

## Regenerating the fixture

The fixture is a plain file. If you resize it, keep the first batch-2 chunk at index `EMBED_BATCH_SIZE` (100, in `server/src/ingest/indexing.ts`) and re-run `extract` + `chunk` to re-check the canary indexes.
