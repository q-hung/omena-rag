# P12 · Hybrid retrieval with RRF (M12, post-MVP)

Status: done (T40, T41); default stays `vector`
Depends on: P09
Requirements: REQ_V2 §7.7, SC-6, HYB-01–04
Recheck when changed (downstream): P13–P18 (RFP retrieval reuses `rag/retrieve.ts`; TASK-12 revisits hybrid if RFP eval shows exact-token misses)

## Amendments received
_none_

Retrieval only (§7.7). Prompt, normaliser and UI are unchanged. Independent of M11.

### [x] T40 · Lexical index, RRF fusion and retrieval mode
- **Goal:** add full-text search beside vector search and fuse them by rank, so exact tokens (codes, currencies, feature names) are found.
- **Refs:** §7.7, RET-01/02, HYB-01–04.
- **Depends:** T27.
- **Acceptance:**
  - Migration: `document_chunks.search_tsv` generated column (`english`, heading + text) + GIN index. Existing chunks are covered without re-indexing.
  - `server/src/retrieve.ts`: lexical list (top 20, `websearch_to_tsquery` with `&` → `|`, `ts_rank_cd`) and vector list (top 20, cosine ≥ `RETRIEVAL_MIN_SCORE`), both with the RET-01 joins. Pure `rrf(lists, k = 60)` returns the top 8; ties break by chunk id.
  - Config: `RETRIEVAL_MODE=vector|hybrid`, default `vector`. Vector mode keeps the T19 query unchanged. Stub mode keeps token overlap.
  - `answer_sources.score` stores the fused score in hybrid mode.
  - Vitest: HYB-02 (pure `rrf`); HYB-01 and HYB-03 against `jarvis_test` with the lexical SQL (no embeddings needed); HYB-04.
- **Result (7 Oct 2026):** `drizzle/0004_hybrid_search.sql` (generated column + GIN). `rag/retrieve.ts`: `rrf()`, `loadHybrid`, `loadByLexical`; `RETRIEVAL_MODE` in config, passed from `generate.service.ts`. Path is `rag/retrieve.ts` after M10. Fused score flows to `answer_sources.score` unchanged. Tests HYB-01–04 in `retrieval.test.ts`; full server suite 203/203 in vector mode.
- **Verify:** `pnpm --filter server test retrieve` passes; `RETRIEVAL_MODE=vector pnpm test` is green with no test changes.

### [x] T41 · Golden cases E16–E20 and vector-vs-hybrid baseline
- **Goal:** measure whether hybrid helps before turning it on.
- **Refs:** §7.7, §13.2, SC-1, SC-2, SC-6, EVAL-01.
- **Depends:** T40.
- **Acceptance:**
  - `server/eval/golden.json` gains E16–E20 (§13.2) with expected documents.
  - The eval report prints `RETRIEVAL_MODE`. The cost estimate is unchanged (no extra provider calls; lexical search is SQL only).
  - Run `pnpm eval` once per mode on the same seed. Paste both reports here, with a per-case diff of retrieval hits.
  - If SC-6 holds, set the default to `hybrid` and record it in REQ_V2 §7.7 and git history (`git show c1c8a33:REQ_V2.MD`). If not, keep `vector` and record why (e.g. lexical noise on E11).
- **Result (7 Oct 2026, Gemini `gemini-3.1-flash-lite`, same seed):** E16–E20 added (loader and tests expect 20 cases, 21 generates); eval prints `RETRIEVAL_MODE`.

  | Metric | vector | hybrid |
  |---|---|---|
  | Retrieval hit rate | 100% (18/18) | 100% (18/18) |
  | Outcome accuracy | 90% (18/20) | 85% (17/20) |
  | Fact-section matches | 100% | 100% |
  | Forbidden hits / removed citations | 0 / 0 | 0 / 0 |
  | p95 latency | 22.1 s | 25.8 s |
  | Cost | $0.0175 | $0.0354 |

  Per-case retrieval hits: identical (every case hits in both). Retrieved lists differ slightly (E07 3→2 docs, E19 3→4, E20 3→4, E16 3→3 with different docs). Outcome diffs: vector fails E05, E09; hybrid fails E04, E09, E10. E04/E05/E10 flipped between earlier same-mode runs too, so these are generation variance, not retrieval. E09 fails in both (and in pre-M12 runs).
- **Decision:** SC-6 holds as a tie, but vector already hits E16–E20, so hybrid shows no gain. **Default stays `vector`** (recorded in REQ_V2 §7.7 and §18). Hybrid stays opt-in via `RETRIEVAL_MODE=hybrid`. Revisit with the RFP golden set (TASK-13).
- **Verify:** `RETRIEVAL_MODE=vector LLM_PROVIDER=gemini pnpm eval` and `RETRIEVAL_MODE=hybrid LLM_PROVIDER=gemini pnpm eval` both complete; the chosen default is backed by the pasted numbers.

---
