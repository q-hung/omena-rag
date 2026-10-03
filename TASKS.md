# Jarvis — Implementation Tasks

Source of truth: `REQ_V2.MD` v2.1 (cited as §n, requirement IDs as `AREA-NN`).
Regenerated from §17 (milestones M0–M9). It replaces the earlier task list
written for the customer-portal design. Mark a task `[x]` only when every
acceptance check passes.

Stack (§14): React + Vite + Tailwind (pnpm) · Node LTS + TypeScript + Fastify +
Drizzle + zod · Postgres 16 + pgvector · worker as a separate entrypoint ·
`pdfjs-dist` · `@google/genai` · Vitest · Docker Compose.

**Starting point.** The clickable prototype (`TASKS_PROTOTYPE.md`, branch
`prototype`) already has every §12 screen, driven by simulated data:
`frontend/src/hooks/useJarvis.js`, `frontend/src/data/jarvis.js` and the rule
functions in `frontend/src/lib/model.js`. These tasks keep its components,
replace its data source with the API, and port its rules to the server.

---

## 0. Spec issues to resolve before coding

Status: **all approved (3 Oct 2026) and applied.** Each one was the smallest change that
unblocks coding and adds no scope.

Already folded into REQ_V2 (3 Oct 2026), from `docs/DESIGN.md` §9: D-1 request
deadline (GEN-04), D-2 deleted chunk in T2 (GEN-05), D-3 abandoned
reservations (COST-04), D-4 conversation row lock (LCK-02). D-5 (3 MB upload
limit) is folded in too (IDX-01, T12, T18).

| # | Issue | Where | Proposed resolution |
|---|---|---|---|
| I1 | The state table doesn't say which state wins when an `insufficient_evidence` answer also has review reasons. | §4.2 | **Approved 3 Oct 2026, applied to REQ_V2 §4.2 (WF-05).** `needs_review` wins (precedence: generating, saved, failed, awaiting_clarification, out_of_scope, needs_review, insufficient_evidence, answer_ready). The prototype already does this. |
| I2 | §9.3 rule 7 converts a third clarification into `insufficient_evidence` but gives it no text. ANS-04 rule 3 then blocks saving an outcome that DEC-6 says can be saved. | §9.3, ANS-04, DEC-6 | **Approved 3 Oct 2026, applied to REQ_V2 §9.3 rule 7.** The server sets a fixed text: "Essential information is still missing after two clarification rounds, so this can't be answered from the available sources." |
| I3 | The schema doesn't say whether `clarification_questions` may carry `[F#]`/`[S#]` markers. The S2b clarification needs to name both payments. | §7.4, §9.3 | **Approved 3 Oct 2026 in an extended form, applied to REQ_V2 §7.4, §9.3, §9.5 (CLR-02, CLR-04):** clarifications are `choose_record` (fact-id options, labels rendered by the server from the snapshot) or `free_text` (markers validated like `answer`, shared S numbering); replies carry `selections` and/or `text`. Original proposal: Allowed. They are resolved and validated like `answer`, and S-ids in questions share the answer's numbering. |
| I4 | Stub mode (§14) has no defined behaviour, so the UI can't be demonstrated without a Gemini key. | §14, CLAUDE.md | **Approved 3 Oct 2026, applied to REQ_V2 §14.** The stub provider returns the prototype's scripted results (moved to `server/fixtures/scripts.ts`), with deterministic embeddings. The UI shows **SIMULATED AI**. `pnpm eval` refuses stub mode. |
| I5 | §12.3 names `useSubPilot.js` / `data/demo.js` as the mock files to delete, but the prototype replaced them with `useJarvis.js` / `data/jarvis.js`. | §12.3 | **Approved 3 Oct 2026, applied to REQ_V2 §12.3 (and §2).** Update the table. Both are deleted once the API is wired (T26). |
| I6 | `navigator.clipboard` works only in a secure context (HTTPS or localhost). Copy answer fails if the demo is opened over plain HTTP from another host. | ANS-03, §14 | **Approved 3 Oct 2026, applied to REQ_V2 ANS-03, §14.** The demo is served on `localhost`. If the clipboard is unavailable, Copy selects the text and says "Press ⌘C / Ctrl+C". |
| I7 | `CLAUDE.md` and `AGENTS.md` still say employees "approve publication to customers"; `docs/DESIGN.md` describes the portal. | repo docs | **Approved 3 Oct 2026, applied to CLAUDE.md, AGENTS.md; docs/DESIGN.md rewritten earlier.** Update all three in T00. |

---

## Conventions

- Scripts (defined in T01): `pnpm dev`, `pnpm test`, `pnpm --filter server test <pattern>`,
  `pnpm db:migrate`, `pnpm seed`, `pnpm worker`, `pnpm eval`, `pnpm build`.
- Server tests use the stub provider and the `jarvis_test` database, truncated between files. They never call Gemini.
- Each task ends with a working slice (migration, API, UI and test together where they apply) and one commit.
- Rules already proven in the prototype are ported to TypeScript, together with their tests, rather than rewritten.

---

## Phase 0 — Foundations (M0)

### [x] T00 · Approve spec issues and update repo docs
- **Result (3 Oct 2026):** I1–I7 approved and applied (none rejected); D-1–D-5 folded into REQ_V2; `CLAUDE.md`, `AGENTS.md` and `docs/DESIGN.md` updated; `prototype` merged into `main`. The verify grep returns nothing.
- **Goal:** one consistent source before coding.
- **Refs:** §0 of this file, §2.
- **Depends:** your approval.
- **Acceptance:**
  - Each approved I-item is folded into the relevant REQ_V2 section. Rejected ones are struck through here.
  - `CLAUDE.md`, `AGENTS.md` and `docs/DESIGN.md` describe the internal-copilot flow (I7).
  - The `prototype` branch is merged into `main`.
- **Verify:** `grep -rn "publication to customers\|portal" CLAUDE.md AGENTS.md docs/DESIGN.md` returns nothing.

### [x] T01 · pnpm workspace and server skeleton
- **Goal:** one repo with `frontend/` (JS) and `server/` (TS), both on pnpm and Vitest.
- **Refs:** §14, DEC-1, DEC-2.
- **Depends:** T00.
- **Acceptance:**
  - Root `package.json` and `pnpm-workspace.yaml`; `frontend/package-lock.json` removed; `.claude/launch.json` uses pnpm.
  - `server/` has `tsconfig`, `src/api.ts` and `src/worker.ts` stubs, Fastify, Drizzle, zod, `fastify-type-provider-zod` and Vitest.
  - `frontend/src/lib/model.test.js` runs under Vitest (import change only).
  - Root scripts from Conventions exist; unimplemented ones exit with a clear message.
- **Verify:** `pnpm install && pnpm build && pnpm test` pass.

### [x] T02 · Compose database and config
- **Goal:** local Postgres with pgvector and a fail-fast config module.
- **Refs:** §14, §10, SEC-01, SEC-09, I4.
- **Depends:** T01.
- **Acceptance:**
  - `docker-compose.yml` `db` service (`pgvector/pgvector:pg16`) with a healthcheck and the `jarvis` and `jarvis_test` databases.
  - `server/src/config.ts` (zod) reads: `DATABASE_URL`, `LLM_PROVIDER` (`stub`/`gemini`), `GEMINI_API_KEY` (required only for gemini), model ids, the price table, `RETRIEVAL_MIN_SCORE`, `DAILY_BUDGET_USD`, `COOKIE_SECURE` and `APP_ORIGIN`.
  - `.env.example` committed; `.env` git-ignored.
- **Verify:** `docker compose up -d db`; `select extversion from pg_extension where extname='vector'` ≥ 0.8; a config test covers a missing key with `LLM_PROVIDER=gemini`.

## Phase 1 — Schema and seed (M1)

### [x] T03 · Schema and migrations
- **Goal:** every table with its constraints.
- **Refs:** §5.1, §6.3, §17a, KB-02, AUTH-03, ANS-04 (unique `conversation_id`).
- **Depends:** T02.
- **Acceptance:**
  - Drizzle schema plus generated migration for: `employees`, `sessions`, `accounts`, `account_features`, `payments`, `webhook_endpoints`, `webhook_deliveries`, `documents`, `document_versions`, `document_files`, `document_chunks` (`vector(768)`, no ANN index), `conversations`, `turns`, `answers`, `answer_sources`, `reviewed_answers`, `provider_calls`, `budget_days`.
  - Constraints:
    - enum `CHECK`s and unique keys;
    - cascades, plus `ON DELETE SET NULL` for `answer_sources.chunk_id` and `documents.active_version_id` (added after `document_versions`);
    - indexes on (`account_id`, `occurred_at desc`), (`endpoint_id`, `attempted_at desc`), conversations (`account_id`, `created_at desc`) and conversations (`created_by`, `account_id`, `created_at desc`) for the Ask list (WF-04).
  - `accounts` has no credential columns.
  - `turns.selected_facts text[]`, with a `CHECK` that a question has `text` and a reply has `text` or a non-empty `selected_facts`.
- **Verify:** `pnpm db:migrate` works on an empty DB and is a no-op on a second run. The schema test checks:
  - an invalid category is rejected;
  - a duplicate `reviewed_answers.conversation_id` is rejected;
  - deleting a document cascades to versions, files and chunks.

### [x] T04 · Account and employee seed
- **Goal:** the §5.2 dataset, deterministic for a given D.
- **Refs:** §5.2, ACC-01.
- **Depends:** T03.
- **Acceptance:**
  - `server/fixtures/accounts.ts` holds the five accounts (moved from `frontend/src/data/jarvis.js`).
  - `pnpm seed [--date=YYYY-MM-DD]` resets the DB and inserts 2 employees (argon2id hashes; passwords from `.env`) and the accounts, payments, endpoints and deliveries, all relative to D.
- **Verify:** `pnpm --filter server test seed`: two runs with the same D give identical rows (ignoring ids); A-1004 WH-1 has 12 trailing 401 deliveries.

## Phase 2 — Server baseline, auth and shell (M2)

### [x] T05 · Fastify baseline
- **Goal:** the hardened HTTP shell every route builds on.
- **Refs:** SEC-03, SEC-04, SEC-11, DEC-2.
- **Depends:** T02.
- **Acceptance:**
  - `buildApp()` with the zod type provider, request ids and a uniform error shape `{ error: { code, message } }`.
  - Log allow-list: request id, route, employee id, status, latency, model, token counts and error codes; no bodies.
  - `@fastify/helmet` with CSP `default-src 'self'`.
  - Mutating requests from a foreign `Origin` → 403.
  - A test helper builds the app against `jarvis_test`.
- **Verify:** `pnpm --filter server test baseline`: a foreign Origin returns 403, the CSP header is present, and captured logs contain no request body.

### [x] T06 · Authentication
- **Goal:** employees log in; every other route needs a session.
- **Refs:** AUTH-01, AUTH-02, SEC-01, SEC-02.
- **Depends:** T04, T05.
- **Acceptance:**
  - `POST /api/auth/login` (the only public route), `POST /api/auth/logout` and `GET /api/me` (returns the employee and `simulated: LLM_PROVIDER === 'stub'`).
  - Sessions store only a token hash.
  - The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` (per config) and expires after 12 h.
  - Login is limited to 5 attempts per minute per email + IP.
- **Verify:** `pnpm --filter server test auth`. The test covers:
  - a wrong password returns 401;
  - the 6th attempt returns 429;
  - an expired session returns 401;
  - an unauthenticated `GET /api/accounts` returns 401;
  - the `sessions` table contains no raw token.

### [x] T07 · Frontend shell on real auth
- **Goal:** the prototype shell runs against the API.
- **Refs:** §12.1, §14, SEC-04, I4.
- **Depends:** T06.
- **Acceptance:**
  - `src/lib/api.js`: `fetch` with credentials and the error shape surfaced. The Vite dev proxy forwards `/api`.
  - React Router routes `/login`, `/ask`, `/history`, `/history/:id` (read-only view), `/kb` and `/kb/:id`. Unauthenticated users are redirected to `/login`.
  - `LoginView` posts real credentials, and its "any input" note is removed.
  - The banner shows **SIMULATED AI** only when `/api/me` says `simulated`. The "Next generation fails" control is removed.
  - Fonts are self-hosted (the woff2 files from the mock bundle) and the Google Fonts import is removed.
- **Verify:** `pnpm --filter frontend build`. Manually: a wrong password shows the error; login lands on `/ask`; logout returns to `/login`. `grep -r "fonts.googleapis\|Next generation fails" frontend/src` returns nothing.

## Phase 3 — Account context (M3)

### [x] T08 · Account context functions and snapshot
- **Goal:** read-only account facts with derived values computed in code.
- **Refs:** §5.3, §5.4, §5.5, CTX-01–05, SIG-01.
- **Depends:** T04.
- **Acceptance:**
  - `getAccountDetails`, `getRecentPayments` (limit ≤ 20, default 10) and `getWebhookStatus` run parameterised `SELECT`s in a `READ ONLY` transaction and take a zod-validated `accountId`.
  - `buildAccountSnapshot(accountId, asOf)` returns `F1…Fn` in fixed order, explicit `empty` sections, and private `record` refs. Logic is ported from `factsFor` in the prototype.
  - Any query error raises `account_data_unavailable`.
  - `getAccountSignals(accountId)` returns the §5.5 badges in category order, computed from the three functions (thresholds as code constants).
- **Verify:** `pnpm --filter server test context`. The test covers:
  - `days_since` across a UTC midnight;
  - `consecutive_failures` = 12 for A-1004 WH-1;
  - EUR/GBP/USD formatting;
  - A-1005 has an empty webhook section;
  - a forced payments-query error raises `account_data_unavailable`;
  - signals: A-1004 → Webhook failing; A-1005 → Payment failed, Past due; A-1003 → Enterprise; A-1001/A-1002 → none; an endpoint with 2 consecutive failures → none.

### [x] T09 · Accounts API and facts panel
- **Goal:** the left pane on real data.
- **Refs:** §17b, CTX-02, SIG-02, §12.2 left pane.
- **Depends:** T07, T08.
- **Acceptance:**
  - `GET /api/accounts` (with `signals[]`) and `GET /api/accounts/:id/facts` (snapshot without `record` refs).
  - `AccountPanel` shows the selected account's signal badges under the selector, with the tooltip "About this account, not this question".
  - Unknown id → 404; non-numeric id → 400.
  - `AccountPanel` reads these instead of `data/jarvis.js`.
- **Verify:** `pnpm --filter server test accounts` covers the 404 and 400 cases. Manually: A-1004 shows 12 consecutive failures and a Webhook failing badge; A-1005 shows "No webhook endpoints configured" and Payment failed + Past due badges.

## Phase 4 — Provider and cost (M4)

### [x] T10 · Provider module (Gemini and stub)
- **Goal:** one interface for embeddings and generation.
- **Refs:** §7.1 steps 4 and 7, §7.4, §14 LLM configuration, DEC-5, I4.
- **Depends:** T02.
- **Acceptance:**
  - `embedDocuments` (one `Content` per chunk), `embedQuery` and `generate`:
    - structured output with the §7.4 schema, validated by zod;
    - lowest thinking level, `maxOutputTokens` 2,048, 20 s timeout for `generate` and 10 s for `embedQuery`;
    - ≤ 2 retries on 429/5xx/timeout, with backoff and jitter;
    - every call takes a `deadline`; no attempt starts after it (GEN-04);
    - a truncated response counts as a failure.
  - Text formats live only in `formatDocumentForEmbedding` and `formatQueryForEmbedding`.
  - The stub returns deterministic embeddings and the scripted results from `server/fixtures/scripts.ts` (moved from the prototype).
  - **Spike:** confirm the model ids, the 768-dim setting, the task-format input and the thinking config against the `@google/genai` docs. Record the findings in REQ_V2 §14 (DEC-5).
- **Verify:** `pnpm --filter server test provider`. The test covers:
  - 500 → 500 → 200 makes 3 attempts;
  - a 400 makes 1 attempt;
  - a truncated response throws;
  - a malformed JSON response throws;
  - with a deadline 1 s away and a hanging first attempt, no retry starts after the deadline.

  Spike, manual: `LLM_PROVIDER=gemini pnpm --filter server exec tsx scripts/smoke-embed.ts` prints 768.

### [x] T11 · Budget reservation, reconciliation and quota
- **Goal:** every paid call is reserved atomically and then reconciled.
- **Refs:** §10, COST-01–04.
- **Depends:** T03, T10.
- **Acceptance:**
  - Reservation: the `budget_days` conditional upsert plus a `provider_calls` row (`reserved`, `estimated_cost_usd`), in one short transaction, before each attempt.
  - Estimate: input ⌈chars ÷ 3⌉ tokens; output = `maxOutputTokens`.
  - Reconciliation: actual tokens and `cost_usd` come from usage metadata; `budget_days` is adjusted by actual − estimate. When usage is unknown, the estimate stays charged.
  - `purpose` is `app`, `indexing` or `eval`. No prompt or response text is stored.
  - Quota: 50 first-attempt `generate` rows per employee per UTC day → 429.
  - `sweepAbandonedReservations()`: `reserved` rows older than 10 minutes → `error` / `abandoned`; `budget_days` unchanged (COST-04). Run by the worker loop (T15).
- **Verify:** `pnpm --filter server test budget`. The test covers:
  - $0.01 left and two concurrent $0.008 reservations → exactly one succeeds;
  - a retry sequence creates one row per attempt;
  - a timeout keeps the estimate;
  - the 51st generation returns 429;
  - a 15-minute-old `reserved` row becomes `abandoned` and `budget_days` doesn't change.

## Phase 5 — Knowledge base (M5)

### [x] T12 · Upload and replace API
- **Goal:** queue new documents and versions.
- **Refs:** KB-03, KB-04, IDX-01, §6.2 step 1.
- **Depends:** T06, T03.
- **Acceptance:**
  - `POST /api/documents` (multipart: file, title, category, effective date, note) and `POST /api/documents/:id/versions`.
  - Validation:
    - ≤ 3 MB (multipart `limits.fileSize`, 413 `FILE_TOO_LARGE`);
    - `.pdf` must start with `%PDF-`;
    - `.md`/`.markdown` must be strict UTF-8 with no NUL bytes and ≤ 300,000 characters (no magic-byte check);
    - the effective date must be ≤ today.
  - Replace → 409 while another version of the document is queued or processing, and 409 on a hash identical to the active version.
  - The file goes into `document_files` and the version is created as `queued`.
- **Verify:** `pnpm --filter server test upload`. The test covers:
  - a `.pdf` with PNG bytes → 400;
  - a 3.1 MB file → 413 `FILE_TOO_LARGE`;
  - a `.md` with invalid UTF-8 → 400;
  - a valid `.md` with no signature → 201;
  - a future date → 400;
  - a duplicate hash → 409;
  - a replace while another version is queued → 409.

  Multipart fields: `file`, `title`, `category`, `effectiveDate`, `note`. 409 codes: `INDEXING_IN_PROGRESS`, `DUPLICATE_HASH`.

### [x] T13 · Sandboxed extractors
- **Goal:** isolated extraction that tolerates blank pages.
- **Refs:** §6.2 step 3, IDX-02, IDX-03.
- **Depends:** T01.
- **Acceptance:**
  - One child process per file: 60 s timeout, memory cap, `env: {}`.
  - **PDF** (`pdfjs-dist`, `isEvalSupported: false`):
    - per-page text with page numbers;
    - encrypted files and files over 100 pages are rejected;
    - pages without text are skipped and listed in warnings;
    - the file fails only when no page has text.
  - **Markdown:** headings from `#`–`###`, ignoring lines inside code fences.
- **Verify:** `pnpm --filter server test extract`. The test covers:
  - a 3-page PDF with blank page 2 → pages 1 and 3 plus a warning naming page 2;
  - an image-only PDF → "No page has a text layer. OCR isn't supported.";
  - a hanging extractor is killed;
  - the child's `process.env` is empty;
  - a `#` inside a fence isn't a heading.

  Child is `spawn` with `env: {}` and `--max-old-space-size=256`; it then deletes leftover Darwin keys so `process.env` is empty. `pdfjs-dist` 6 dropped `isEvalSupported` (eval is permanently off); we still pass `false`.

### [x] T14 · Chunker
- **Goal:** passages sized for retrieval.
- **Refs:** §6.2 step 4.
- **Depends:** T13.
- **Acceptance:** one chunk per Markdown section or PDF page; chunks over ~500 estimated tokens (chars ÷ 4) are split at paragraph boundaries; each chunk keeps its heading path ("A > B") and page.
- **Verify:** `pnpm --filter server test chunk`: a 3,000-char section splits on a blank line; nested headings give "A > B".

### [x] T15 · Indexing worker
- **Goal:** queued versions become active, or fail without side effects.
- **Refs:** §6.2 steps 2 and 5–7, KB-05, KB-06, IDX-04, §7.5.
- **Depends:** T10, T11, T12, T14.
- **Acceptance:**
  - `pnpm worker` claims versions with `FOR UPDATE SKIP LOCKED`, then runs extract → chunk → embed (one reservation per batch).
  - Activation is one transaction:
    1. lock the document row with `FOR UPDATE`;
    2. insert the chunks and set the version to `ready`, storing any warnings;
    3. set `active_version_id` only if the new version number is higher.
  - Errors → `failed` with a short message that contains no document text.
  - A retry deletes partial chunks first.
  - Versions in `processing` for more than 10 minutes → `failed`.
  - Each loop also runs `sweepAbandonedReservations()` (T11).
  - Budget reached → `failed` with "Daily budget reached — retry later".
- **Verify:** `pnpm --filter server test worker`. The test covers:
  - a failed v3 leaves v2 active;
  - activating v2 over an active v3 is a no-op;
  - two workers never claim the same version;
  - after a retry, the chunk count equals the new chunks only;
  - a stale `processing` version becomes `failed`.

  `pnpm worker --once` drains the queue then exits. One `embed_document` reservation covers the version's chunks.

### [x] T16 · KB management API
- **Goal:** list, inspect, archive, delete, download and retry.
- **Refs:** KB-01, KB-06–09, §7.5, §17b.
- **Depends:** T15.
- **Acceptance:**
  - `GET /api/documents` supports `ILIKE` search over titles and active-version chunk text, a category filter and `archived=1`.
  - `GET /api/documents/:id` returns each version's content from its chunks, plus its error and warnings.
  - `POST …/archive` and `…/restore`.
  - `POST …/versions/:vid/retry` works only on the latest failed version (otherwise 409).
  - `GET …/impact` returns counts of unsaved answers and reviewed answers citing the document.
  - `DELETE` runs in one transaction under `FOR UPDATE`.
  - `GET …/versions/:vid/file` sends `attachment` and `nosniff`.
- **Verify:** `pnpm --filter server test kb`. The test covers:
  - search matches active-version text only;
  - retry on a non-latest version → 409;
  - after delete, no versions, files or chunks remain and reviewed answers are unchanged;
  - an unauthenticated download → 401.

  `archived=1` includes archived documents. `GET /api/documents/indexing-status` returns `{ busy }` for the UI poller.

### [x] T17 · KB fixtures and seed indexing
- **Goal:** `pnpm seed` reproduces the §6.4 knowledge base.
- **Refs:** §6.4.
- **Depends:** T15, T04.
- **Acceptance:**
  - `server/fixtures/kb/` holds:
    - the five Markdown documents, with text moved from the prototype;
    - `sso-setup-guide.pdf` (text PDF, 3 pages, page 2 blank);
    - `failed-payment-retries.pdf` (image only);
    - `refund-policy-v3.md` (not seeded; used for S6 and the eval).
  - Effective dates are relative to D. The seed queues every version.
- **Verify:** `pnpm seed && pnpm worker --once` → 6 documents Ready (SSO guide with one warning) and 1 Failed with "No page has a text layer". Running it twice gives the same result.

  Covered by `pnpm --filter server test worker` (seed + `runWorker({ once: true })`).

### [x] T18 · KB UI on the API
- **Goal:** the prototype KB views on real data.
- **Refs:** KB-01–09, §14 (3 s polling).
- **Depends:** T07, T16, T17.
- **Acceptance:**
  - `KnowledgeBaseView`, `DocRow`, `UploadDialog` and `DocumentView` call the API.
  - Upload and Replace use a real file input; server errors are shown inline.
  - The dialog rejects files over 3 MB before uploading ("Files must be 3 MB or smaller").
  - Polls every 3 s while any version is queued or processing.
  - Delete shows the `/impact` counts.
  - Download links to the file endpoint.
- **Verify:** manual with the stub provider and `pnpm worker` running: upload a `.md`, watch Queued → Processing → Ready without reloading, then delete it and see the counts in the confirmation.

  Ask / History still use `useJarvis` prototype data. KB views use `useDocuments`.



## Phase 6 — Generation (M6)

### [ ] T19 · Retrieval
- **Goal:** the access filter lives in SQL.
- **Refs:** §7.2, RET-01, RET-02.
- **Depends:** T15.
- **Acceptance:** top 8 by exact cosine distance; active versions of non-archived documents with the configured `embedding_model` only; rows below `RETRIEVAL_MIN_SCORE` dropped. Zero rows is a valid result.
- **Verify:** `pnpm --filter server test retrieval`: passages from a superseded version, an archived document or another embedding model are never returned; the threshold drops low scores.

### [ ] T20 · Prompt builder and normaliser
- **Goal:** pure functions for model input and output.
- **Refs:** §7.3, §7.4, §9.3, PRM-01, NRM-01, WF-05, I1–I3.
- **Depends:** T08.
- **Acceptance:**
  - **Prompt:**
    - in order: versioned instructions, facts `F#` with `as_of` and empty sections, passages `S#` with metadata, prior clarification turns (with selections rendered as `Employee selected: F10 — <snapshot value>`), then the delimited untrusted question;
    - stays within 6,000 estimated tokens by dropping the lowest-ranked passages; facts are never dropped;
    - never contains company name, refs, webhook URL hosts, or employee names or emails.
  - **Normaliser:** ported from `normalise` in the prototype, with its tests:
    - unknown ids removed, with `invalid_citation_removed`;
    - uncited conflict sources get the next numbers;
    - `S` ids renumbered;
    - model review reasons filtered to the allowed values;
    - `answer` without a citation becomes `insufficient_evidence` with `no_valid_citation`;
    - clarification rules: `choose_record` options validated against the snapshot (same section, 2–4, labels from fact values; fewer than 2 → `free_text`), `free_text` markers resolved with the answer's numbering, at most 2 clarifications, and I2's fixed text.
- **Verify:** `pnpm --filter server test prompt normalise`. The test covers:
  - PRM-01 for all five accounts;
  - an over-budget prompt drops the last passage;
  - `[S9]` with 3 passages is removed and flagged;
  - an uncited conflict source gets n+1;
  - `choose_record` with options `[F11, F10, F99]` stores F11 and F10 with labels equal to their snapshot values; with only `[F10]` valid it becomes `free_text`;
  - an `[S2]` in a `free_text` question gets the next number after the answer's citations and an `answer_sources` row;
  - a third clarification becomes `insufficient_evidence` with the fixed §9.3 rule 7 text and a `user_input` gap, and that answer can be saved (ANS-04 rule 3 passes).

### [ ] T21 · Conversations API and generation flow
- **Goal:** `POST /api/conversations` produces a saved answer or changes nothing.
- **Refs:** §7.1, WF-01, GEN-01–05, LCK-02, AUTH-02, CTX-05, §17b.
- **Depends:** T09, T11, T19, T20.
- **Acceptance:**
  - `requireOwner(conversation, employee)` → 403 `NOT_OWNER` unless `created_by` is the signed-in employee. It runs after the 404 check and before every state check, and every conversation write route uses it (here, and in T23–T25).
  - **T1:** `SELECT … FOR UPDATE` on the conversation, ownership check, quota check, lock with a `generation_token` (409 if held), and insert the turn.
  - **Outside any transaction:** snapshot (abort on `account_data_unavailable` → 503), embed, retrieve, prompt, generate, normalise. A 90 s deadline from T1's commit is passed to every provider call (GEN-04).
  - **T2:** `SELECT … FOR UPDATE` on the conversation; the token must still match (else 409 and discard), then insert the answer and `answer_sources` (each `chunk_id` resolved inside the insert, GEN-05) and clear the lock.
  - Failure: no answer saved, lock cleared only if the token matches, error recorded.
  - `POST /api/conversations/:id/regenerate` re-runs the latest turn (creator only).
  - `GET /api/conversations/:id` (any employee) returns turns, the latest answer per turn, facts, evidence cards with status badges, flags, the derived state (WF-05) and `ownedByMe`.
- **Verify:** `pnpm --filter server test generate`. The test covers:
  - a concurrent second request → 409;
  - an expired, taken-over lock can't save or clear the new owner's lock;
  - a stub failure leaves the answer count unchanged and the state `failed`;
  - zero passages still calls the model;
  - while a stubbed generate call is blocked, archiving a cited document completes immediately (GEN-01);
  - with every stubbed attempt hanging, the request fails within 110 s and makes no attempt after 90 s (GEN-04);
  - deleting a retrieved document before T2 still saves the answer, with a null `chunk_id` and the "Source updated" flag (GEN-05);
  - employee B regenerating A's conversation → 403 `NOT_OWNER`, with no turn, answer or `provider_calls` row created; B's `GET` on it → 200 with `ownedByMe: false`.

### [ ] T22 · Ask workspace on the API
- **Goal:** the prototype's three panes driven by the API.
- **Refs:** §12.2, ANS-01, ANS-07, ANS-09, SIG-02, WF-04, UI-01.
- **Depends:** T09, T21.
- **Acceptance:**
  - `ConversationPanel`, `EvidencePanel` and `WorkspaceView` read the conversation from the API; "Generating…" shows while the request is pending; Retry appears on failure.
  - Suggested questions appear only in stub mode.
  - `GET /api/conversations?accountId=:id&mine=1` returns my conversations for the account, newest first. Ask shows them as a list beside the new-question box and never loads another employee's conversation (WF-04).
  - Each row and the conversation header show the account's signal badges (SIG-02) and the question's topic badges (ANS-09), computed on the server: `topics` = distinct categories of the latest answer's cited documents in fixed order, "Account data" when only facts are cited, none for out-of-scope or failed.
  - No confidence percentages or "verified" labels.
- **Verify:** `pnpm --filter server test conversations-list`: with A and B each owning a conversation on A-1004, A's `mine=1` list contains only A's; topics: E01 → Plans, Security; E06 → Policies, FAQ; E12 → Account data; E11 → none. Manually with the stub: S1, S3, S4 and S5 render as in §13.1. `grep -rn "confidence\|verified" frontend/src` finds no UI text.

## Phase 7 — Review flow (M7)

### [ ] T23 · Clarification replies
- **Goal:** the S2b round trip on the API.
- **Refs:** CLR-01–04, AUTH-02, §7.1 step 2.
- **Depends:** T21.
- **Acceptance:**
  - `POST /api/conversations/:id/replies {selections?, text?}` (`text` ≤ 1,000 chars; at least one of the two, else 400) is creator-only (403 `NOT_OWNER`) and is allowed only when the latest outcome is `clarification_required` (otherwise 409).
  - Each selected fact id must be an option of a `choose_record` clarification in the latest answer, at most one per clarification (else 400).
  - The reply is inserted in T1, under the conversation row lock (LCK-02), as a new turn (`text`, `selected_facts`), so the account and prior turns are kept.
  - UI: `choose_record` shows radio options with the server labels plus "None of these" with a note field; `free_text` shows a text box. Suggested-reply chips from the prototype are removed.
  - The next prompt includes the conversation so far, and the retrieval query is turn 1 plus the latest reply.
- **Verify:** `pnpm --filter server test clarify`: a reply on an `answer_ready` conversation → 409; an empty reply → 400; selecting F12 when the options are F10/F11 → 400; selecting F10 stores `selected_facts = ["F10"]` and the next prompt contains "Employee selected: F10"; B replying to A's clarification → 403 `NOT_OWNER` and no new turn. Manually: S2b (select the GBP 600.00 option) ends in Needs review with Exception unclear, and the account is unchanged.

### [ ] T24 · Edit and copy
- **Goal:** edits validated on the server; copy without markers.
- **Refs:** ANS-02, ANS-03, AUTH-02, I6.
- **Depends:** T21.
- **Acceptance:**
  - `PATCH /api/answers/:id {editedText}`:
    - runs under `SELECT … FOR UPDATE` on the conversation (LCK-02), creator only (403 `NOT_OWNER`);
    - only on the latest answer of an unsaved conversation;
    - every `[n]` and `[F#]` must exist in the answer (else 400);
    - `answer_text` never changes.
  - Copy strips markers on the client and falls back to selecting the text (I6). It's available to every employee, including in the read-only view.
- **Verify:** `pnpm --filter server test edit`: `[7]` → 400; `[F99]` → 400; `answer_text` is unchanged after an edit; editing a saved conversation → 409; B editing A's answer → 403 `NOT_OWNER` and `edited_text` unchanged.

### [ ] T25 · Save reviewed answer, locking and staleness
- **Goal:** the API enforces every save rule, under document-lifecycle locks.
- **Refs:** ANS-04, ANS-05, ANS-06, LCK-01, LCK-02, AUTH-02, STL-01, §7.5, §7.6, SC-3.
- **Depends:** T16, T24.
- **Acceptance:**
  - `POST /api/conversations/:id/review {answerId, reviewAcknowledged}` is creator-only (403 `NOT_OWNER`, checked before the 409s) and returns 409 for:
    - generating, not the latest answer, or already saved;
    - a `clarification_required` or `out_of_scope` outcome;
    - empty text;
    - a stale source;
    - review reasons without acknowledgement.
  - One transaction takes `FOR UPDATE` on the conversation (LCK-02), then `FOR SHARE` on the cited documents (ordered by id), runs the stale check, and inserts `reviewed_answers` with the source snapshot (`document_id`, `version_id`, …) for the markers left in the text, plus the facts snapshot.
  - Staleness flags use the two §7.6 queries and are included in conversation reads.
- **Verify:** `pnpm --filter server test review`. The test covers:
  - each 409 case;
  - B saving A's conversation → 403 `NOT_OWNER` and no `reviewed_answers` row;
  - two concurrent saves → one 200 and one 409;
  - a save racing an activation of a cited document never commits a stale save;
  - a save racing an edit either includes the edit or makes the edit return 409 `ALREADY_SAVED` (LCK-02);
  - a save racing T2 either sees the new answer as latest or returns 409 `NOT_LATEST`;
  - delete after save keeps the snapshot, and the flag shows "Source changed — recheck";
  - restore clears an archive flag.

### [ ] T26 · History on the API and prototype removal
- **Goal:** History on real data; no simulated data left in the client.
- **Refs:** WF-02, WF-03, AUTH-02, SIG-02, ANS-09, §12.3, I5.
- **Depends:** T22, T23, T25.
- **Acceptance:**
  - `GET /api/conversations?accountId&state&mine` returns rows newest first, with derived state, flags and creator.
  - The History state is derived in SQL with the WF-05 order; a shared fixture test checks that it matches the TypeScript derivation for every state.
  - `HistoryView` has a **Mine / All** toggle, defaulting to Mine (WF-03).
  - History rows show signal and topic badges; filter chips by signal (`signal=`) and by topic (`topic=`). Saved conversations take topics from their snapshot.
  - Opening my conversation goes to Ask. Opening another employee's goes to a **read-only view** (`/history/:id`): turns, answers, facts and evidence, the banner "Started by another employee — read-only", and Copy answer; no reply box, Edit, Regenerate or Save.
  - The Save/Edit/Copy actions use the API.
  - `frontend/src/hooks/useJarvis.js` and `frontend/src/data/jarvis.js` are deleted. Rule helpers left in `lib/model.js` are only display helpers (labels, tones); the server owns the rules.
- **Verify:** manual with the stub: S2a, S2b and S6 end to end (save → replace Refund policy → "Source changed — recheck" → new answer cites v3 with Policy applicability). `grep -rn "useJarvis\|data/jarvis" frontend/src` returns nothing. The "Webhook failing" filter shows only A-1004 conversations and the "Billing" filter only answers citing a Billing document. With two seeded employees: *Mine* hides the other's rows, *All* shows them, and the other's conversation opens read-only with no write buttons.

## Phase 8 — Evaluation (M8)

### [ ] T27 · Golden set and `pnpm eval`
- **Goal:** measure SC-1, SC-2 and SC-4 and calibrate.
- **Refs:** §13.2, EVAL-01, §14 generation model.
- **Depends:** T26, T17.
- **Acceptance:**
  - `eval/golden.json` holds E01–E15 (account, question, replies as `selections`/`text`, expected outcome, expected `choose_record` options for E04, review reasons, expected documents, cited fact sections, forbidden patterns).
  - `pnpm eval`:
    1. seeds an eval DB with D = 2026-10-02 and indexes it with Gemini;
    2. applies v3 before E13;
    3. prints the estimated cost first, and refuses if it's over the remaining budget or `LLM_PROVIDER=stub`;
    4. reports the hit rate, outcome accuracy, review-reason matches, removed citations, forbidden-pattern hits, cost and p95;
    5. lists the answers for a manual read.
  - `RETRIEVAL_MIN_SCORE` and the model id are calibrated and committed.
- **Verify:** `LLM_PROVIDER=gemini pnpm eval` reports a hit rate ≥ 90%, outcome accuracy ≥ 80%, 0 forbidden hits and p95 ≤ 15 s. Paste the results into this task.

## Phase 9 — Delivery (M9)

### [ ] T28 · Docker delivery
- **Goal:** `docker compose up` runs the full demo.
- **Refs:** §14 deploy, SEC-04.
- **Depends:** T26.
- **Acceptance:**
  - A multi-stage Dockerfile; compose runs `db`, `api` and `worker`.
  - `api` serves the built frontend with an SPA fallback for `/login`, `/ask`, `/history/*` and `/kb/*`.
  - Migrations run on start.
  - The app is served on `localhost` (I6).
- **Verify:** `docker compose up --build -d && docker compose exec api pnpm seed`; `curl -sI localhost:8080/ask | grep -i content-security-policy` matches; log in through the browser.

### [ ] T29 · Release check
- **Goal:** confirm the MVP is done.
- **Refs:** §1 SC-1–4, SEC-11, §13.3, §16.
- **Depends:** T27, T28.
- **Acceptance:**
  - All §13.3 automated tests pass.
  - SC-1, SC-2 and SC-4 are met (from T27); SC-3 is covered by the T25 test.
  - A log sample from a full flow contains no question, answer, document or fact text.
  - Every §16 item is ticked.
- **Verify:** `pnpm test`; `docker compose logs api worker | grep -c "eligible for a refund"` returns 0; review the §16 checklist.

---

## Dependency order

```text
T00 → T01 → T02 ─┬→ T03 → T04 ─┬→ T06 → T07 ──────────────┬→ T09 ─┐
                 │             └→ T08 ─────────────────────┘       │
                 ├→ T05 → T06                                       │
                 └→ T10 → T11 ─┐                                    │
T01 → T13 → T14 ───────────────┴→ T12 → T15 → T16 → T17 → T18       │
                                       T15 → T19 ─┐                 │
                                       T08 → T20 ─┴→ T21 ←──────────┘
T21 → T22, T23, T24 → T25 (+T16) → T26 → T27 → T28 → T29
```

**Optional (§15), not scheduled:** OPT-1 tool calling, OPT-2 streaming,
OPT-3 LLM-judge eval, OPT-4 "Cited in answers", OPT-5 activation toast,
OPT-6 follow-up questions, OPT-7 HNSW, OPT-8 fact staleness.
