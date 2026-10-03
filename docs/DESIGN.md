# Jarvis — System Design (v1)

Status: draft · 2 Oct 2026 · implements `REQ_V2.MD` (§n), with the proposed
corrections C1–C20 from `TASKS.md`, which still need approval. If this file and
REQ_V2 disagree, REQ_V2 wins.

---

## 1. Requirements summary

**Functional**
- Customers submit questions and read their published answers (portal).
- Agents generate drafts with citations, inspect evidence, edit, and approve (approving publishes) (console).
- Agents manage a versioned knowledge base: upload, replace, archive, delete, download.
- Every factual claim cites a passage. Approval is blocked by the server when a cited source is stale, or when a conflict hasn't been acknowledged.

**Non-functional**

| Concern | Target | Source |
|---|---|---|
| Draft latency | p95 ≤ 15 s | §1 |
| Retrieval quality | expected doc in top 8 for ≥ 90% of answerable golden cases; label ≥ 80% | §1, §11 |
| Cost | ≤ `DAILY_BUDGET_USD` per day (≈ $5); ≈ $0.003–0.007 per draft | §8 |
| Availability | Demo-grade: single host, restart on failure | §10 |
| Security | session auth, role-separated APIs, SQL-side retrieval filter, sandboxed parsing, no PII to the model | §9 |

**Constraints:** one tenant, synthetic data, a small team, the stack fixed by §10. The console is desktop only and the portal is responsive.

**Explicit non-goals:** streaming, notifications, auto-generation, multi-tenancy, OCR, an ANN index, object storage, a cache layer.

---

## 2. High-level design

```text
                ┌──────────────────────── browser ────────────────────────┐
                │  /portal (customer)            /console (agent)        │
                │  React + Router + Tailwind, fetch + hooks, poll 3 s     │
                └───────────────┬────────────────────────────────────────┘
                                │ HTTPS, same origin, session cookie
                                ▼
┌──────────────────────────── api (Fastify, Node TS) ─────────────────────────────┐
│ static SPA │ /api/auth │ /api/portal/* (customer) │ /api/agent/* (agent)          │
│ helmet CSP · Origin check · rate limit · multipart limits · log allow-list      │
│                                                                                 │
│  questions  drafts(generate/edit/approve)  kb(upload/archive/delete/download)   │
│      │               │   │                          │                           │
│      │      retrieval│   │provider (embed, generate)│                           │
└──────┼───────────────┼───┼──────────────────────────┼───────────────────────────┘
       │               │   │                          │ INSERT version 'queued'
       ▼               ▼   ▼                          ▼
┌──────────────────────── Postgres 16 + pgvector ────────────────────────────────┐
│ users sessions questions answer_drafts draft_sources answer_reviews            │
│ documents document_versions document_files(bytea) document_chunks(vector 768)  │
│ provider_calls  (also: the job queue = document_versions.indexing_status)      │
└──────────────────────────────▲─────────────────────────────────────────────────┘
                               │ SELECT … FOR UPDATE SKIP LOCKED
┌──────────────────────────── worker (same codebase) ───────────────────────────┐
│ claim → extract (child process, env {}, 60 s, mem cap) → chunk → embed        │
│        → activate in one transaction | mark failed                            │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │ HTTPS (API key, server only)
                                ▼
                      Gemini API (@google/genai)
                 embeddings (768-d) · Flash-Lite generation
```

**Three processes, one database.** Postgres is the store, the job queue, the
quota ledger (`provider_calls`) and the file store (`document_files`). This
keeps the demo to `db`, `api` and `worker` in Compose (§10), with no other
infrastructure.

---

## 3. Data flows

### 3.1 Indexing (asynchronous)

```text
agent ──POST /documents (multipart)──▶ api
  api: check ext+magic, ≤10 MB, effective_at ≤ today, hash ≠ active, no in-flight version
  api: tx{ insert document?, version(queued), document_files } ──▶ 201 {versionId}
worker loop (every 2 s):
  tx1: claim 1 'queued' FOR UPDATE SKIP LOCKED → 'processing', processing_started_at=now
  check budget → else failed("Daily budget reached — retry later")
  extract in child  ──▶ pages/sections | error → failed(msg)
  chunk (section/page, split >~500 tok at paragraphs, heading path)
  embed (1 Content per chunk, batched requests) ──▶ provider_calls rows
  tx2: delete partial chunks; insert chunks; status=ready, indexed_at;
       UPDATE documents SET active_version_id=v WHERE id=d
         AND (active_version_id IS NULL OR <active.version_number> < v.version_number)   -- C2
sweeper (each loop): processing_started_at < now-10 min → failed
UI polls GET /documents every 3 s while any version is queued|processing
```

The old version stays active until tx2 commits, so a failed version never
affects retrieval.

### 3.2 Draft generation (synchronous)

```text
agent ──POST /questions/:id/drafts──▶ api
 1 guard: question unanswered · drafts today < 30 · budget left
 2 lock: UPDATE questions SET generation_started_at=now() WHERE … stale-or-null → 0 rows ⇒ 409
 3 embedQuery("task: search result | query: …")                 [provider_calls]
 4 retrieve top 8 (exact cosine, SQL filter) → drop < RETRIEVAL_MIN_SCORE
 5 none left → save empty missing_evidence draft (no model call) → step 9
 6 prompt ≤ 6,000 tok: system(vN) · S1..Sk · context{plan, profile, today, received_at} · <question>
 7 generate (JSON schema, 20 s/attempt, ≤2 retries on 429/5xx/timeout) [provider_calls]
 8 normalise: drop unknown S ids → renumber [1..n] → number uncited conflict sources (C1) → label
 9 tx: insert answer_drafts + draft_sources(all retrieved, cited ones numbered);
       set question status; clear lock  ──▶ 201 draft
 fail at 3–8: clear lock, keep status, return 502 {retryable}
```

Worst case: 3 attempts × 20 s + backoff ≈ 65 s, which is below the 2-minute
lock. The p95 target (15 s) assumes one attempt (typically 2–6 s on Flash-Lite)
plus about 1 s for the embedding.

### 3.3 Approve (publish)

```text
agent ──POST /questions/:id/approve {draftId, conflictsAcknowledged}──▶ api
 tx (SERIALIZABLE not needed; the unique key decides):
   SELECT question FOR UPDATE
   409 if generating | draftId ≠ latest | answered | final text empty
   409 if stale (§6 SQL)             409 if conflicts && !ack
   INSERT answer_reviews(question_id UNIQUE, final_text, sources snapshot {n,title,version,heading,page,document_id,version_id})
   UPDATE questions SET status='answered', answered_at=now()
 portal GET → final_text with markers stripped
```

`SELECT … FOR UPDATE` on the question row serialises approval against
generation and against a second approval. The unique `question_id` is the
backstop.

---

## 4. API contracts

All routes are JSON unless noted. Errors use `{ error: { code, message, details? } }`.
Every route except login needs a session. Mutating routes need the app `Origin`.

### Auth (C17)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{email,password}` → sets cookie. 5 attempts/min per email+IP → 429 |
| POST | `/api/auth/logout` | deletes the session |
| GET | `/api/me` | `{id,name,role,simulated}` |

### Portal (customer only, always filtered by session user)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/portal/questions` | `{subject≤120, body≤2000}`; 20/UTC day → 429 |
| GET | `/api/portal/questions` | own list `{id,subject,status:'received'|'answered',createdAt}` |
| GET | `/api/portal/questions/:id` | own only, else 404; `answer` = stripped `final_text` when answered |

### Agent: questions and drafts
| Method | Path | Notes |
|---|---|---|
| GET | `/api/agent/questions?status=` | newest first; `{rows:[…, stale], unansweredCount}` |
| GET | `/api/agent/questions/:id` | question + customer record (display) |
| POST | `/api/agent/questions/:id/drafts` | generate; 409 locked/answered, 429 quota, 503 budget, 502 provider |
| GET | `/api/agent/questions/:id/drafts/latest` | text, edited text, label, unknowns, conflicts (numbers), `stale`, `generating`, evidence cards, review (if answered) |
| PATCH | `/api/agent/drafts/:id` | `{editedText}`; 400 on unknown `[n]`; 409 if not latest or answered |
| POST | `/api/agent/questions/:id/approve` | `{draftId, conflictsAcknowledged}`; 409 + `code` per rule |

The 409 `code`s (`GENERATING`, `NOT_LATEST`, `ANSWERED`, `EMPTY`, `STALE`,
`CONFLICT_UNACKED`) drive the UI hints. The UI computes the same rules
locally, but only for display.

### Agent: knowledge base
| Method | Path | Notes |
|---|---|---|
| GET | `/api/agent/documents?q=&category=&archived=` | list with active version and indexing status |
| POST | `/api/agent/documents` | multipart: file, title, category, effectiveAt, changeNote |
| POST | `/api/agent/documents/:id/versions` | multipart replace; 409 in-flight / same hash |
| GET | `/api/agent/documents/:id` | versions (with status/error), content per version from chunks, citedBy |
| POST | `/api/agent/documents/:id/versions/:vid/retry` | latest + failed only (C2) |
| POST | `/api/agent/documents/:id/archive` · `/restore` | |
| GET | `/api/agent/documents/:id/impact` | `{openDrafts, publishedAnswers}` |
| DELETE | `/api/agent/documents/:id` | one transaction |
| GET | `/api/agent/documents/:id/versions/:vid/file` | bytes; `attachment`, `nosniff` |

---

## 5. Deep dive

### 5.1 Data model notes (beyond §6)
- **Circular FK:** `documents.active_version_id → document_versions(id) ON DELETE SET NULL`, added in a second migration step (C19).
- **Latest draft** = `max(id)` per question. Supporting index: `answer_drafts(question_id, id desc)`.
- **Quota index:** `answer_drafts(created_by, created_at)`. Budget index: `provider_calls(created_at)`.
- **Inbox stale flag:** run the §6 stale `EXISTS` once per row, for the latest draft only. With fewer than 1k open questions this is a cheap correlated subquery, so no denormalised column is needed.
- **Snapshot** (`answer_reviews.sources`) has plain ids, not FKs, so it survives deletes (C6).
- **Vectors:** 768 × 4 B ≈ 3 KB per chunk. 10k chunks ≈ 30 MB, which is easily scanned exactly.

### 5.2 Server module layout
```text
server/src/
  api.ts  worker.ts  config.ts
  db/        schema.ts, client.ts, migrations/
  http/      app.ts (buildApp), auth.ts (sessions, guards), errors.ts, origin.ts
  routes/    auth.ts, portal.ts, agent-questions.ts, agent-drafts.ts, agent-kb.ts
  rag/       retrieve.ts, prompt.ts, normalise.ts, label.ts, stale.ts
  llm/       provider.ts (interface), gemini.ts, stub.ts, cost.ts, retry.ts
  indexing/  extract-child.ts, extract.ts (spawn+limits), chunk.ts, run.ts (claim/activate)
```
`rag/*` and `indexing/chunk.ts` are pure functions, so most tests need neither
a database nor a provider.

### 5.3 Queue design
- **Postgres is the queue:** `indexing_status='queued'` is the job, claimed with `FOR UPDATE SKIP LOCKED`, and multiple workers are safe.
- **Concurrency:** one job per worker process. Parse and embed time is dominated by network calls, so one worker is enough at demo scale.
- **No LISTEN/NOTIFY:** polling every 2 s is simpler, and latency doesn't matter for indexing.
- **Idempotency:** a retry deletes the version's chunks first, and activation happens in a single transaction, so a crash mid-job leaves either nothing or a fully active version.

### 5.4 Error handling and retries
| Failure | Behaviour |
|---|---|
| Gemini 429/5xx/timeout | ≤ 2 retries, exponential backoff (0.5 s, 1.5 s) + jitter; then fail |
| Gemini 4xx / schema-invalid JSON / truncated (`MAX_TOKENS`) | no retry; fail |
| Generation fails | no draft, status unchanged, lock cleared, `provider_calls.status='error'`; UI shows Retry |
| Extraction limit hit | kill child; version `failed` with a fixed message (never document text) |
| Worker crash mid-job | the sweeper marks it `failed` after 10 min; agent retries |
| Budget reached | API 503 for generate; worker marks the version failed (C12) |
| Duplicate approve | `FOR UPDATE` + unique key → second request 409 |

### 5.5 Caching
None in v1. The heavy objects are embeddings, which are already persisted.
Query embeddings aren't cached, because questions are unique. Re-indexing is
avoided by the identical-hash check. Delete has no caches to purge (§9).

### 5.6 Security boundaries
- **Retrieval filter in SQL** (active, non-archived, model match). The prompt never decides access.
- **Model input:** passages plus `plan`, `profile`, `today` and `received_at`. Name, email, company and employee names are never sent (enforced by a test on the prompt builder).
- **Parser sandbox:** child process, `env: {}`, 60 s, `--max-old-space-size`, `pdfjs-dist` with `isEvalSupported:false`.
- **Output:** plain text only, rendered by React, with no Markdown or HTML.
- **CSP** `default-src 'self'`; self-hosted fonts (C5).

---

## 6. Scale and reliability

**Load estimate (demo / early pilot)**

| Quantity | Estimate | Implication |
|---|---|---|
| Agents | 2–10 | ≤ 300 drafts/day at quota |
| Concurrent generations | ≤ 10 | 10 held HTTP requests; trivial for Node |
| KB | 7 → ~200 docs, ≤ 10k chunks | exact scan < 50 ms |
| Questions | ≤ 1k/day | single Postgres, no partitioning |
| Spend | ≤ $5/day cap | hard stop in the API and worker |

**Scaling path:** scale vertically first. The API is stateless (sessions live
in the DB), so it can run several replicas behind a proxy. Workers scale
horizontally because of `SKIP LOCKED`. The single point of failure is
Postgres, which is acceptable for a demo; managed Postgres with PITR is the
first upgrade.

**Monitoring:**
- Structured logs (allow-list fields only).
- `provider_calls` is the metrics source: p95 latency, error rate, daily cost and tokens per draft, queryable with SQL.
- Alerts (pilot): budget at 80%, generation error rate > 10%/hour, a version stuck in queued for more than 5 min, plus the Google Cloud budget alert (§8).

---

## 7. Trade-offs

| Decision | Chosen | Alternative | Why / cost |
|---|---|---|---|
| Generation mode | synchronous request | job + polling / streaming | Simplest UX and code; costs a held connection up to ~65 s worst case. Streaming is out of scope (§1) |
| Queue | Postgres `SKIP LOCKED` | Redis/BullMQ, SQS | No new infra; adequate to thousands of jobs/day. Lacks delayed jobs and backpressure tooling |
| Files | `bytea` in Postgres | S3 + presigned URLs | Private by default, deleted transactionally; DB size grows (10 MB × versions). Revisit beyond about 1 GB |
| Vector search | exact scan, no index | HNSW | Exact recall and correct filtering (no post-filter loss); O(n) per query. Fine to ~50k chunks |
| Citations | parsed from `[S#]` markers in text | separate citation array | Text and citations can't disagree; requires a normaliser and C1 for uncited conflict sources |
| Staleness | computed on read (SQL `EXISTS`) | flag set on activation | No fan-out writes or drift; a small per-row query cost |
| Approve = publish | single step | approve then send | Fewer states; no undo after approval (consistent with "no editing published answers") |
| Auth | own sessions + argon2id | OAuth/IdP | No external dependency for seeded users; SSO is out of scope |
| Provider | single (Gemini) behind an interface + stub | multi-provider | Stub needed for tests anyway; a second real provider is YAGNI |
| Frontend state | fetch + hooks | React Query / Redux | Per §10. Polling and refetch are hand-written; revisit if cache bugs appear |

---

## 8. What to revisit as it grows

1. **Chunks above ~50k:** add HNSW with `hnsw.iterative_scan` (§10) and keep a recall check in `pnpm eval`.
2. **Files above ~1 GB, or large PDFs:** move `document_files` to object storage with presigned URLs.
3. **Generation p95 over target or held connections at scale:** move to job + polling (reusing the worker) or to streaming.
4. **More than one tenant:** add `workspaces`, memberships and a tenant filter in retrieval SQL (§6 "Changes from v1").
5. **Real customer data:** a GDPR/DPA assessment and region pinning (Vertex AI), per §9.
6. **Label quality:** if the "any unknown means missing_evidence" rule causes misses in eval, tighten the prompt first and the rule second.
7. **Ops:** if `provider_calls` SQL dashboards aren't enough, export metrics (OpenTelemetry) instead.

---

## 9. Open items

- C1–C20 in `TASKS.md` need approval (T00).
- C10: verify the `gemini-embedding-2` input format, dimensions and normalisation, and the generation model id and thinking config, against current `@google/genai` docs (T11 spike).
- Calibrate `RETRIEVAL_MIN_SCORE` and choose the model in `pnpm eval` (T27).
