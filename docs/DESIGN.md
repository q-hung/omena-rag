# Jarvis — System Design (v2.1)

Status: draft · 3 Oct 2026 · implements `REQ_V2.MD` v2.1 (cited as §n and by
requirement ID) and the spec issues I1–I7 in `TASKS.md` (all approved). If this file
and REQ_V2 disagree, REQ_V2 wins. Design decisions that REQ_V2 doesn't make
are marked **D-n** and listed in §9.

---

## 1. Requirements summary

**Functional**
- An employee selects a fictional account, asks a support question, and gets one of four outcomes: `answer`, `clarification_required`, `insufficient_evidence` or `out_of_scope` (§9.1).
- Answers combine **structured facts** (read-only SQL functions, `[F#]`) with **document passages** (vector retrieval, `[n]`). The two kinds of evidence are shown in separate panels.
- Clarifications are either a **record choice** (`choose_record`: the model picks candidate fact ids, the server renders their labels from the snapshot) or a **free-text question** (markers validated like answers). Replies carry selections and/or text and continue the same conversation, for at most 2 rounds.
- Edit (markers can be removed, not added), Copy without markers, and Save as an immutable internal record. Nothing is sent to customers.
- **Ownership:** every employee can read every conversation, but only its creator can change it (AUTH-02). Ask shows only my conversations (WF-04); History has Mine / All and opens other employees' conversations read-only (WF-03).
- A versioned knowledge base: upload, replace, archive, delete, retry and download. Saved answers whose sources change are flagged.

**Non-functional**

| Concern | Target | Source |
|---|---|---|
| Generation latency | p95 ≤ 15 s | SC-4 |
| Retrieval / outcome quality | expected doc in top 8 for ≥ 90%; outcome ≥ 80%; 0 forbidden claims | SC-1, SC-2 |
| Cost | ≤ `DAILY_BUDGET_USD` (≈ $5/day), enforced by atomic reservation | §10 |
| Correctness under concurrency | no stale save; no double save; no answer written by a lock that was taken over | LCK-01, ANS-04, GEN-02 |
| Availability | demo-grade: one host, restart on failure | §14 |
| Privacy | structured identity fields never sent to the model; free text sent as written | §7.3, SEC-10 |

**Constraints:** the §14 stack (React/Vite, Fastify/TS, Drizzle, zod, Postgres + pgvector, Gemini), one tenant, synthetic data, a small team, and the existing prototype UI to reuse.

**Non-goals (MVP):** customer access, model tool calling, streaming, multi-tenancy, OCR, an ANN index, object storage, caches, follow-up questions.

---

## 2. High-level design

```text
┌──────────────────────────── browser (employee, desktop) ────────────────────────────┐
│ React + Router: /login  /ask  /history[/:id]  /kb/*  fetch + hooks, poll KB every 3 s │
│ Ask = AccountPanel (facts F#) | ConversationPanel (answer, actions) | EvidencePanel   │
└───────────────────────────────────────┬─────────────────────────────────────────────┘
                                        │ same origin, session cookie, JSON / multipart
                                        ▼
┌──────────────────────────────── api (Fastify, TS) ──────────────────────────────────┐
│ helmet CSP · Origin check · rate limit · zod schemas · log allow-list · static SPA   │
│                                                                                      │
│ routes ──▶ context/ (read-only account functions → snapshot F1..Fn)                  │
│        ──▶ rag/     (retrieve · prompt · normalise · state · stale)                  │
│        ──▶ llm/     (provider: gemini | stub · retry · budget reserve/reconcile)     │
│        ──▶ kb/      (upload · archive · delete · download · impact)                   │
└────────┬──────────────────────────────────────┬─────────────────────────┬───────────┘
         │ SQL (short transactions only)         │ HTTPS, key server-side   │
         ▼                                       ▼                          │
┌────────────────────── Postgres 16 + pgvector ───────────────┐   Gemini API │
│ business: accounts · account_features · payments ·           │   embeddings│
│           webhook_endpoints · webhook_deliveries (read-only) │   (768-d) + │
│ KB:       documents · document_versions · document_files ·   │   Flash-Lite│
│           document_chunks (vector 768)                       │   generation│
│ work:     conversations · turns · answers · answer_sources · │       ▲     │
│           reviewed_answers                                   │       │     │
│ ops:      employees · sessions · provider_calls · budget_days│       │     │
│ queue = document_versions.indexing_status                    │       │     │
└──────────────────────────────▲───────────────────────────────┘       │     │
                               │ claim FOR UPDATE SKIP LOCKED            │     │
┌──────────────────────── worker (same codebase) ─────────────────────────┴─────┘
│ claim → extract (child process, env {}, 60 s, memory cap) → chunk → embed      │
│       → activate (lock document row, one transaction) | failed (+warnings)     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Three processes, one database.** Postgres is the business store, the vector
store, the job queue, the file store and the cost ledger. In Compose that's
`db`, `api` and `worker`, with no other infrastructure.

**Two evidence paths, kept apart on purpose.**

| | Structured facts | Unstructured knowledge |
|---|---|---|
| Source | `accounts`, `payments`, `webhook_*` | Markdown / text PDFs |
| Access | 3 explicit read-only functions | SQL-filtered vector search |
| Unit | fact `F#` (code-derived values) | passage `S#` → `[n]` |
| Absence | explicit empty section → `no_record` gap | no passage → `documentation` gap |
| Freshness | static in the MVP; snapshot stored per answer | version activation → staleness flags |

Account records are never embedded (§6.3). Exact values such as dates,
amounts and failure streaks come from code, not from similarity search.

---

## 3. Data flows

### 3.1 Ask / regenerate (synchronous)

```text
employee ──POST /api/conversations {accountId, question}──▶ api
                        (or POST …/:id/replies {selections?, text?}, POST …/:id/regenerate)
 T1  tx: SELECT conversations … FOR UPDATE                                     (~ms)
         quota: first-attempt generate rows today < 50          else 429
         lock: SET generation_token=:t, generation_started_at=now()
               WHERE token IS NULL OR started_at < now()-2 min  else 409
         INSERT turn (question | clarification_reply)     ← the text survives failure
     commit
 ── no transaction held from here (GEN-01) ─────────────────────────────────────────
  1  snapshot = buildAccountSnapshot(accountId, asOf)    READ ONLY tx; error ⇒ 503 account_data_unavailable
  2  reserve → embedQuery(turn 1 + latest reply)          → reconcile
  3  retrieve top 8, exact cosine, SQL filter, ≥ RETRIEVAL_MIN_SCORE (0 rows is fine)
  4  prompt ≤ 6,000 est. tokens: instructions · F# · S# · prior turns · <untrusted question>
  5  reserve → generate (zod-checked JSON) → reconcile   ≤ 2 retries; request deadline (D-1)
  6  normalise (§9.3): ids · renumber · conflicts · reasons · outcome rules
 T2  tx: SELECT conversations … FOR UPDATE
         token ≠ :t ⇒ discard result, 409 (cost stays recorded)
         INSERT answers; INSERT answer_sources (chunk_id resolved in-statement, D-2)
         clear lock
     commit ──▶ 201 { conversation, latest answer, facts, evidence, state, flags }
 failure after T1: clear lock iff token = :t · provider_calls error row · 502/503 · state 'failed'
```

**Latency budget (one attempt each):** snapshot < 50 ms + query embedding
0.3–1 s + retrieval < 50 ms + generation 2–6 s (Flash-Lite, ≤ 2,048 output
tokens) ≈ **3–8 s p95**, inside the 15 s target with one retry to spare.

### 3.2 Indexing (asynchronous)

```text
employee ──POST /api/documents | …/:id/versions (multipart)──▶ api
  validate: ≤3 MB (D-5) · .pdf starts %PDF- · .md strict UTF-8, no NUL, ≤300k chars · effective ≤ today
            no in-flight version · hash ≠ active
  tx: insert (document?), version 'queued', document_files ──▶ 201
worker loop (every 2 s):
  tx: claim 1 'queued' FOR UPDATE SKIP LOCKED → 'processing'
  extract in child ─▶ pages/sections (+ blank-page warnings) | no text at all ⇒ failed
  chunk ─▶ reserve → embed batch → reconcile (repeat)      budget refused ⇒ failed("Daily budget reached…")
  tx: SELECT documents WHERE id=:d FOR UPDATE              ← serialises with save, archive, delete
      DELETE partial chunks; INSERT chunks; version 'ready' (+warnings)
      UPDATE documents SET active_version_id=:v WHERE id=:d
        AND (active_version_id IS NULL OR active.version_number < :n)      (KB-05)
sweeper: 'processing' for more than 10 min ⇒ failed
```

The old version answers questions until the activation transaction commits.

### 3.3 Save reviewed answer

```text
employee ──POST /api/conversations/:id/review {answerId, reviewAcknowledged}──▶ api
 tx: SELECT conversations … FOR UPDATE
     409 GENERATING | NOT_LATEST | ALREADY_SAVED | NOT_SAVEABLE (clarification/out_of_scope) | EMPTY
     SELECT documents WHERE id IN (cited) ORDER BY id FOR SHARE          (LCK-01)
     stale EXISTS (§7.6)                       ⇒ 409 STALE_SOURCE
     reasons ≠ [] AND !reviewAcknowledged      ⇒ 409 REVIEW_UNACKNOWLEDGED
     INSERT reviewed_answers (conversation_id UNIQUE, final text,
            sources[{n, document_id, version_id, title, version, heading, page}] for markers left,
            facts[cited F#], review_acknowledged, reviewer)
 commit ──▶ 201
```

`FOR SHARE` on documents and `FOR UPDATE` in activation, archive and delete
make the save and the lifecycle change mutually exclusive. Whichever commits
second sees the other's result (LCK-01). Locks are taken in id order, so
concurrent saves can't deadlock.

### 3.4 Budget reservation (every paid call)

```text
tx (short): INSERT budget_days(day, spent) VALUES (:d, :est)
            ON CONFLICT (day) DO UPDATE SET spent = budget_days.spent + :est
            WHERE budget_days.spent + :est <= :limit RETURNING spent     -- 0 rows ⇒ budget_reached
            INSERT provider_calls(status 'reserved', estimated_cost_usd, purpose, attempt, …)
call provider
tx (short): UPDATE provider_calls SET status, tokens, cost_usd = actual (or keep estimate if unknown)
            UPDATE budget_days SET spent = spent - :est + :actual
```

A single conditional upsert decides atomically, so concurrent requests can't
both pass a "sum < limit" check. The estimate is deliberately high (⌈chars ÷ 3⌉
input tokens + `maxOutputTokens`), so reconciliation usually gives money back.

---

## 4. API contracts

JSON unless noted. Errors use `{ error: { code, message, details? } }`. Every
route except login needs a session. Mutating routes need the app `Origin`.
Bodies are validated with zod (DEC-2).

| Method & path | Request | Success | Errors (code) |
|---|---|---|---|
| `POST /api/auth/login` | `{email, password}` | 204 + cookie | 401, 429 |
| `POST /api/auth/logout` | — | 204 | — |
| `GET /api/me` | — | `{id, name, simulated}` | 401 |
| `GET /api/accounts` | — | `[{id, ref, company, plan, status}]` | — |
| `GET /api/accounts/:id/facts` | — | `{asOf, facts[F#], empty[]}` (no `record`) | 400, 404 |
| `POST /api/conversations` | `{accountId, question ≤2000}` | 201 `Conversation` | 400, 404, 409 `LOCKED`, 429 `QUOTA`, 502 `PROVIDER`, 503 `BUDGET` / `ACCOUNT_DATA_UNAVAILABLE` |
| `POST /api/conversations/:id/replies` | `{selections?: F#[], text?: ≤1000}`, at least one; each selection must be an option of the latest `choose_record` | 201 `Conversation` | as above + 400 `INVALID_SELECTION`, 403 `NOT_OWNER`, 409 `NOT_AWAITING_CLARIFICATION`, `ALREADY_SAVED` |
| `POST /api/conversations/:id/regenerate` | — | 201 `Conversation` | as above + 403 `NOT_OWNER` |
| `GET /api/conversations?accountId&state&mine` | — | `[{id, account, firstQuestion, state, flag, createdBy, createdAt, ownedByMe}]`; `mine=1` filters to `created_by = me` (Ask list, History default) | — |
| `GET /api/conversations/:id` | — | `Conversation` | 404 |
| `PATCH /api/answers/:id` | `{editedText}` | 200 `Answer` | 400 `UNKNOWN_MARKER`, 403 `NOT_OWNER`, 409 `NOT_LATEST` / `ALREADY_SAVED` |
| `POST /api/conversations/:id/review` | `{answerId, reviewAcknowledged}` | 201 `Reviewed` | 403 `NOT_OWNER`, 409 with the codes in §3.3 |
| `GET /api/documents?q&category&archived` | — | list with active version, status, warnings | — |
| `POST /api/documents` | multipart: file, title, category, effectiveAt, note | 201 | 400, 413, 409 |
| `POST /api/documents/:id/versions` | multipart: file, effectiveAt, note | 201 | 400, 413, 409 `IN_FLIGHT` / `SAME_HASH` |
| `GET /api/documents/:id` | — | versions (status, error, warnings, content from chunks) | 404 |
| `POST /api/documents/:id/archive` · `/restore` | — | 204 | 404 |
| `POST /api/documents/:id/versions/:vid/retry` | — | 202 | 409 `NOT_LATEST_FAILED` |
| `GET /api/documents/:id/impact` | — | `{unsaved, saved}` | 404 |
| `DELETE /api/documents/:id` | — | 204 | 404 |
| `GET /api/documents/:id/versions/:vid/file` | — | bytes, `attachment`, `nosniff` | 404 |

`Conversation` = `{ id, account, turns[], answers: latest per turn, facts, evidence[{n, title, cat, v, eff, heading, page, text, status}], state, flag, generating, ownedByMe, savedRecord? }`.

**Authorization order** for every conversation write: session (401) → conversation exists (404) → `created_by = me` (403 `NOT_OWNER`) → state checks (409). Reads (`GET`) skip the ownership check.
The UI shows the server's 409 codes as hints. The client may pre-compute them
for display, but the server decides.

---

## 5. Deep dive

### 5.1 Data model

```text
employees 1─* sessions
accounts 1─* account_features · payments · webhook_endpoints 1─* webhook_deliveries
accounts 1─* conversations 1─* turns 1─* answers 1─* answer_sources *─0..1 document_chunks
conversations 1─0..1 reviewed_answers (sources/facts as JSON snapshots, plain ids)
documents 1─* document_versions 1─1 document_files
                                1─* document_chunks
documents.active_version_id ─▶ document_versions (SET NULL, added in a second step)
provider_calls ─▶ employees / conversations / document_versions (nullable)
budget_days (day PK)
```

- **Latest answer** = `max(answers.id)` per conversation; index `answers(conversation_id, id desc)`.
- **State** is derived (§4.2, ordered table, first match wins — WF-05). It is computed in SQL for History, with one `LATERAL` join to the latest answer, and in TypeScript for single reads. A shared test checks that both give the same result.
- **Staleness** is computed on read (§7.6), never stored, so there are no fan-out writes on activation.
- **Snapshots** (`answers.facts_snapshot`, `reviewed_answers.sources/facts`) hold plain values, not FKs, so they survive deletes.
- **Indexes:** `payments(account_id, occurred_at desc)`, `webhook_deliveries(endpoint_id, attempted_at desc)`, `conversations(account_id, created_at desc)` for History, `conversations(created_by, account_id, created_at desc)` for the Ask list, `provider_calls(employee_id, created_at)` for the quota, `document_versions(indexing_status)` for the queue.
- **Size:** 768 × 4 B ≈ 3 KB per chunk; 10k chunks ≈ 30 MB. Original files ≤ 3 MB each (D-5), so 200 documents × 3 versions stay under ~1.8 GB in the worst case and far less in practice. Account data is a few hundred rows.

### 5.2 Account context

- Three functions, each a parameterised `SELECT` in `BEGIN READ ONLY`. `accountId` comes from the conversation row, never from model output (CTX-02).
- `buildAccountSnapshot` assigns `F1…Fn` in a fixed order (account → features → payments → webhooks). This is deterministic for the same data, so ids are stable across regenerations.
- Derived values come from code: `days_since`, the first succeeded payment, minor-unit formatting, `consecutive_failures`, `last_success_at`, 7-day outcome counts.
- `record` refs (table + id) stay server-side. They link fact chips to rows in the UI and are stripped from the prompt.
- **Upgrade path (OPT-1):** the same three functions become the only tools. Tool calling changes *when* they run, not *what* they can read.

### 5.3 Prompt and normalisation

- Pure functions in `rag/prompt.ts` and `rag/normalise.ts`, ported from the prototype together with its tests.
- The prompt has a fixed section order, and untrusted text sits inside explicit delimiters. Facts are never truncated; passages are dropped lowest rank first.
- The PRM-01 test runs the prompt builder for all five accounts and checks that no company name, ref, URL host or employee identity appears.
- **Record choices are rendered, not written by the model.** For `choose_record`, the model only names candidate fact ids. The server checks them against the snapshot and labels each option with that fact's value, so a clarification can't contain a miscopied amount or date, and the reply is an exact fact id rather than text to interpret.
- Normalisation is the only path from model output to stored answer, so the save rules can trust its result: ids are valid, numbering is dense, and conflict sources are numbered.

### 5.4 Concurrency control

| Contention | Mechanism |
|---|---|
| Two employees writing to one conversation | Ruled out by ownership (403 `NOT_OWNER`); only the creator can write |
| Two generations on one conversation (same employee, two tabs) | T1 token lock (409); stale lock taken over after 2 min |
| A taken-over request finishing late | T2 token check: the result is discarded |
| Save vs generation / edit / reply | `conversations` row `FOR UPDATE` in each short transaction |
| Save vs activation / archive / delete | documents `FOR SHARE` (save) vs `FOR UPDATE` (lifecycle) |
| Double save | `FOR UPDATE` + unique `reviewed_answers.conversation_id` |
| Two workers, one job | `FOR UPDATE SKIP LOCKED` |
| Concurrent budget spend | single conditional upsert on `budget_days` |
| Chunk deleted between retrieval and T2 | `answer_sources.chunk_id` resolved inside the insert (D-2) |

### 5.5 Queue

- Postgres is the queue: `indexing_status = 'queued'` is the job. Workers poll every 2 s; there's no LISTEN/NOTIFY.
- One job per worker process. Throughput is dominated by embedding latency, and one worker is enough for the demo.
- Retries are idempotent: partial chunks are deleted before re-running, and activation is a single transaction.

### 5.6 Errors and the four kinds of "missing"

| Situation | Where it's detected | Result |
|---|---|---|
| No matching record | snapshot `empty` section | gap `no_record`; never a negative product claim (ANS-08) |
| DB failure building the context | `context/` throws | 503 `ACCOUNT_DATA_UNAVAILABLE`, no model call, state `failed` |
| Provider 429/5xx/timeout | `llm/retry` | ≤ 2 retries with backoff + jitter within the deadline, then 502, state `failed` |
| Provider 4xx / invalid JSON / truncated | `llm/` | no retry; 502 |
| Docs don't establish it | model gap / outcome | `insufficient_evidence` or `documentation` gap |
| Employee must supply it | model outcome | `clarification_required` (≤ 2 rounds) |
| Budget reached | reservation | 503 `BUDGET` (API); version `failed` (worker) |
| Extractor limit or crash | worker | version `failed` with a fixed message, never document text |

### 5.7 Caching

None. Embeddings are persisted, query embeddings are one-off, identical
uploads are rejected by hash, and account snapshots are a handful of indexed
reads. A cache would only add invalidation risk against the freshness rules.

### 5.8 Security boundaries

- **Trust boundaries:** browser → API (session, Origin, zod), API → model (no tools; the only output is zod-validated JSON), uploads → worker (sandboxed child, `env: {}`).
- **Retrieval access** is decided in SQL. **Account access** is decided by the conversation row. The prompt decides neither.
- **Conversation writes** need `created_by = me` (AUTH-02), checked by one `requireOwner` guard that every write route uses. Reads are open to all employees, so team visibility stays without shared writes. The knowledge base is shared and has no ownership.
- **Output** is plain text rendered by React, with no Markdown or HTML.
- **Logs** use an allow-list of fields, so question, answer, document and fact text never reach them (SEC-11).

### 5.9 Module layout

```text
server/src/
  api.ts  worker.ts  config.ts
  db/        schema.ts, client.ts, migrations/
  http/      app.ts, auth.ts, origin.ts, errors.ts
  routes/    auth.ts, accounts.ts, conversations.ts, answers.ts, documents.ts
  context/   account.ts (3 read-only functions), snapshot.ts
  rag/       retrieve.ts, prompt.ts, normalise.ts, state.ts, stale.ts
  llm/       provider.ts, gemini.ts, stub.ts, retry.ts, budget.ts
  indexing/  extract-child.ts, extract.ts, chunk.ts, run.ts
server/fixtures/  accounts.ts, scripts.ts (stub), kb/*.md|pdf
frontend/src/     existing prototype components + lib/api.js
```

`context/snapshot.ts`, `rag/*` and `indexing/chunk.ts` are pure, so most
tests need neither a database nor a provider.

---

## 6. Scale and reliability

**Load estimate (demo / pilot)**

| Quantity | Estimate | Implication |
|---|---|---|
| Employees | 2–10 | ≤ 500 generations/day at quota |
| Concurrent generations | ≤ 10 | 10 held requests of ≤ ~100 s; trivial for Node |
| Accounts | 5 (seed) → thousands | indexed per-account reads, independent of total |
| KB | 7 → ~200 docs, ≤ 10k chunks | exact scan < 50 ms |
| Spend | ≤ $5/day | hard stop at reservation |

**Scaling path:** the API is stateless (sessions live in Postgres), so run more
replicas behind a proxy. Workers scale out because of `SKIP LOCKED`. Postgres
is the single point of failure; managed Postgres with point-in-time recovery is
the first upgrade.

**Monitoring.** `provider_calls` is the metrics source: p95 latency, error rate,
cost per day and per generation, tokens per call. Add structured logs from the
allow-list. Alerts for a pilot:
- budget at 80%;
- generation error rate > 10% per hour;
- a version queued for more than 5 minutes;
- reservations stuck in `reserved` for more than 10 minutes (a crashed request);
- the Google Cloud budget alert.

---

## 7. Trade-offs

| Decision | Chosen | Alternative | Why / cost |
|---|---|---|---|
| Account context | prefetched bounded snapshot | model-selected tool calls | One model call, predictable cost and latency, easy to test. It can include unneeded facts; the bounds keep that under ~1,500 tokens. Tool calling is OPT-1 |
| Account facts in retrieval | relational only | embed account rows | Exact values and explicit "no record"; similarity search would blur amounts and dates |
| Generation | synchronous request | job + polling / streaming | Simplest code and UX; holds a connection up to the deadline |
| Locking | ownership token + short transactions | one long transaction around the model call | No DB connection held for seconds; needs the T2 token check |
| Budget | atomic upsert reservation | sum of `provider_calls` before the call | Correct under concurrency; reconciliation adds one write per call |
| Conflict handling | show both, require acknowledgement | precedence rule (non-FAQ / newest wins) | No false certainty; the employee does more work on conflicts |
| Staleness | computed on read | flag written on activation | No drift or fan-out; a small `EXISTS` per row |
| Citations | markers parsed from text | separate citation list | Text and citations can't disagree; needs the normaliser |
| Queue | Postgres `SKIP LOCKED` | Redis/BullMQ | No new infrastructure; lacks delayed jobs and backpressure tooling |
| Files | `bytea` in Postgres, ≤ 3 MB each | object storage | Private and deleted in the same transaction; the 3 MB cap keeps rows small and DB growth predictable |
| Vector search | exact scan | HNSW | Exact recall and correct filtering; O(n) per query |
| Validation | zod everywhere | Fastify JSON Schema | One schema language for routes, function args and model output |
| Simulated mode | stub provider with scripts | none | Demo and tests without a key; must stay clearly labelled |

---

## 8. What to revisit as it grows

1. **Snapshot misses or bloat** (eval shows facts the model needed but didn't get): move to OPT-1 tool calling over the same three functions.
2. **More than ~50k chunks:** HNSW with `hnsw.iterative_scan`, plus a recall check in `pnpm eval`.
3. **Writable account data:** fact staleness (OPT-8). Store record versions in the snapshot and flag saved answers like document sources.
4. **Generation p95 over target or many held connections:** job + polling on the existing worker, or streaming (OPT-2).
5. **Files above ~1 GB:** object storage with presigned URLs.
6. **Multiple tenants:** `workspaces`, memberships, and a tenant filter in the retrieval and account SQL.
7. **Real customer data:** a GDPR/DPA assessment, region pinning (Vertex AI) and PII scrubbing of free text before the model call.
8. **Ops beyond SQL dashboards:** OpenTelemetry metrics and traces.

---

## 9. Design decisions

D-1 to D-5 were folded into REQ_V2 on 3 Oct 2026 (GEN-04, GEN-05, COST-04, LCK-02, IDX-01).

| # | Gap | Decision |
|---|---|---|
| D-1 | **Worst case exceeds the lock.** Embedding (3 attempts × 20 s) plus generation (3 × 20 s) plus backoff ≈ 125 s, which is more than the 2-minute lock expiry. A second request could take over while the first is still spending. Correctness holds (the T2 token check), but money is wasted. | Query-embedding timeout 10 s, generation timeout 20 s, and an **overall request deadline of 90 s**: no new attempt starts after it. Worst case ≈ 90 s + one 20 s attempt in flight = 110 s < 120 s lock. → GEN-04 |
| D-2 | **A chunk deleted between retrieval and T2** makes the `answer_sources` FK insert fail, so the generation fails for no good reason. | Insert `chunk_id` as `(SELECT id FROM document_chunks WHERE id = :id)`. A vanished chunk becomes null, and the answer is immediately flagged "Source updated" (cards show "Source deleted"). → GEN-05 |
| D-3 | **Reservation rows left `reserved`** after a crash are never reconciled. | Keep the estimate charged (conservative). The worker's sweeper marks `reserved` rows older than 10 minutes as `error` with code `abandoned`, without changing `budget_days`. → COST-04 |
| D-4 | Every mutating conversation route must serialise on the same row. | T1, T2, edit, reply and save each start with `SELECT … FROM conversations WHERE id = :id FOR UPDATE`. → LCK-02 |
| D-5 | **Upload size.** REQ_V2 allowed 10 MB, far more than the KB needs. Large files also mean large `bytea` rows, slower uploads and more parsing memory in the sandbox. | **≤ 3 MB per file.** That covers a 100-page text PDF (usually 1–2.5 MB with embedded fonts) and the 300,000-character Markdown limit (≤ ~1.2 MB in UTF-8). Enforced by Fastify multipart `limits.fileSize = 3 MiB` → 413 `FILE_TOO_LARGE`. The upload dialog checks `file.size` first and shows "Files must be 3 MB or smaller". The page and character limits are unchanged. → IDX-01, §10; TASKS T12, T18 |

**Open items carried from TASKS.md:** none (I1–I7 approved and applied: I1 → WF-05, I2 → §9.3 rule 7, I3 extended → §7.4/§9.5 CLR-04, I4 → §14 stub mode, I5 → §12.3, I6 → ANS-03, I7 → repo docs); DEC-5 embedding
format spike (T10); calibration of `RETRIEVAL_MIN_SCORE` and the model (T27).
