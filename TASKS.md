# Jarvis — Implementation Tasks

Source of truth: `REQ_V2.MD` (cited as §n). This file lists the open spec
issues and the tasks, in dependency order. Mark a task `[x]` only when every
acceptance check passes.

Stack (§10, unchanged): React + Vite + Tailwind (pnpm) · Node LTS + TypeScript +
Fastify + Drizzle · Postgres 16 + pgvector · worker as a separate entrypoint ·
`pdfjs-dist` · `@google/genai` · Docker Compose.

---

## 0. Spec issues to resolve before coding

Status: **proposed, needs approval**. Each correction is the smallest change
that unblocks coding. None of them adds scope. Once a correction is approved,
add it to REQ_V2 (T00).

### Blocking

| # | Issue | Where | Proposed correction |
|---|---|---|---|
| C1 | In the refund-timing case, the conflicting FAQ passage is reported in `conflicts` but not cited in `answer`. Because "citations are read from markers only", it gets no evidence card (yet the banner says "both passages are shown"), and the stale check never sees it. | §4.3, §5.3, §6 `draft_sources`, §11 | When normalising, give each conflict source that isn't already cited the next citation number (after the text markers). It then gets an evidence card, counts toward staleness and goes into the snapshot. Map `conflicts[].sources/followed` to those numbers. |
| C2 | **Retry** on an old failed version can activate it over a newer active version (v3 fails → v4 becomes active → retry v3 → v3 replaces v4). | §4.4, §5.1.6 | Allow Retry only on the document's latest version. The activation transaction also sets `active_version_id` only if `version_number` is greater than the current active version's number. |
| C3 | The model is told to compare customer dates with effective dates and to reason about "20 days since first payment", but the prompt doesn't contain today's date or the question date. | §5.2.6, §5.3, §11 refund cases | Add `today` (UTC date) and `question_received_at` to the customer-context block. |
| C4 | Decision #5 says "Jarvis" is internal only, but §13 renames "the header" to Jarvis, and the portal is customer-facing. | §12 #5, §13 | Use "Jarvis" only in `/console`. The portal is titled "SubPilot Support". |
| C5 | The CSP `default-src 'self'` blocks the Google Fonts import in `frontend/src/index.css`. | §9, decision #4 | Self-host Nunito Sans: copy the woff2 files already embedded in the mock bundle into `frontend/src/assets/fonts`. No new dependency. |
| C6 | The approval `sources` snapshot has no document or version ids. The "historical record" note (§4.3) and "Cited in answers" (§4.4) can't tell whether a source changed, especially after a delete. | §6 `answer_reviews` | Add `document_id` and `version_id` to each snapshot entry. These are plain values, not FKs, so they survive a delete. |
| C7 | The test runner and test database aren't specified. | §11 | Use Vitest for frontend and server. Server tests run against a `jarvis_test` database in the compose Postgres, truncated between files. No testcontainers. |
| C8 | §10 says pnpm, but `frontend/` uses npm (`package-lock.json`). The repo layout isn't defined. | §10 | Use a pnpm workspace with `frontend/` and `server/`. `server/` holds the API (`src/api.ts`) and worker (`src/worker.ts`) entrypoints. Remove `package-lock.json`. |
| C9 | Seeding (§11) needs real embeddings, so there's no way to run the app without a Gemini key, although tests already need a stub provider. | §10, §11, CLAUDE.md | `LLM_PROVIDER=stub\|gemini` reuses the test stub. In stub mode the console shows a **SIMULATED AI** banner (CLAUDE.md: simulated behaviour must be labelled). `pnpm eval` refuses to run in stub mode. |
| C10 | The embedding text formats (`title: … \| text: …`, `task: search result \| query: …`) and the claim that "768-d vectors are normalised" are unverified for `gemini-embedding-2`. Earlier Gemini embedding models used a `taskType` parameter instead. | §5.1.5, §5.2.3, §7 | Keep the spec as is, but put the formatting behind one function and verify it in the T11 spike. Normalisation doesn't change cosine (`<=>`) ranking, so it doesn't block. Update §7 only if the docs disagree. |

### Clarifications (default applied unless you object)

| # | Issue | Default |
|---|---|---|
| C11 | The "20 questions per day" period isn't defined. | UTC day, the same as the agent quota (§8). |
| C12 | When the budget is reached during indexing, a queued version would wait forever. | The worker marks it `failed` with "Daily budget reached — retry later". |
| C13 | The mock's customer context includes "Account manager: R. Haddad" (an employee name, which §4.3 forbids sending) and "Days since" (a derived value). | Drop the account manager from the seed. "Days since" isn't stored; the model gets `first_payment_at` plus `today` (C3). |
| C14 | The mock shows the status as "Approved"; the spec status is `answered`. | The badge and filter say "Answered". The button says "Approve & publish". |
| C15 | An agent can remove a citation marker, but the stale SQL (§6) checks every cited source. | Keep the spec SQL (conservative): removing a stale marker doesn't unblock approval, so the hint says "Regenerate". The snapshot lists only the markers that remain in the final text. |
| C16 | After a delete, `draft_sources.chunk_id` becomes null, and the evidence card has no data. | Show the card as "Source deleted". The draft is stale. |
| C17 | No routes are given for auth or the current user. | `POST /api/auth/login` (the only public route), `POST /api/auth/logout`, `GET /api/me` (any role; returns the role and the `simulated` flag). |
| C18 | `Secure` cookies may be dropped on `http://localhost` in some browsers. | `COOKIE_SECURE` defaults to `true`. Set `false` only for local http. |
| C19 | `documents.active_version_id` ↔ `document_versions.document_id` is a circular FK. | `active_version_id … ON DELETE SET NULL`, added after both tables exist. |
| C20 | REQ_V2 says it supersedes `REQUIREMENTS.md`, but that file isn't in the repo (only `docs/old_notes.md`). | Cosmetic. Point the reference at `docs/old_notes.md`. |

**Risk, no spec change:** under §4.3, *any* unknown means `missing_evidence`. If the model adds a minor unknown to the refund-timing or webhooks case, those golden cases fail. T27 measures this. If it fails, tighten the prompt (unknowns only for what the question asks), not the rule.

---

## Conventions

- Scripts (defined in T01): `pnpm dev`, `pnpm test`, `pnpm --filter server test <pattern>`,
  `pnpm db:migrate`, `pnpm seed`, `pnpm worker`, `pnpm eval`, `pnpm build`.
- Server tests use the stub provider and never call Gemini.
- Each task ends with a working slice: migration, API, UI and test together where they apply.

---

## Phase 0 — Foundations

### [ ] T00 · Apply approved spec corrections
- **Goal:** REQ_V2 reflects the approved C1–C20 decisions, so later tasks cite one source.
- **Refs:** §0 of this file.
- **Depends:** your approval.
- **Acceptance:** each approved correction is added to the relevant REQ_V2 section, or to a new §14 "Corrections". Rejected ones are struck through here.
- **Verify:** `grep -n "C1\|C2\|C3" REQ_V2.MD`, then review the diff.

### [ ] T01 · pnpm workspace and server skeleton
- **Goal:** one repo with `frontend/` (existing, JS) and `server/` (TS), both on pnpm and Vitest.
- **Refs:** §10, C7, C8.
- **Depends:** T00.
- **Acceptance:**
  - Root `package.json` and `pnpm-workspace.yaml` exist; `frontend/package-lock.json` is removed.
  - `server/` has `tsconfig`, `src/api.ts` and `src/worker.ts` stubs, and Vitest.
  - The root scripts from Conventions exist; unimplemented ones exit with a clear message.
- **Verify:** `pnpm install && pnpm build && pnpm test` all pass (an empty placeholder test is fine).

### [ ] T02 · Compose database and config
- **Goal:** local Postgres with pgvector, and a validated config module.
- **Refs:** §10, §7, §8, C9, C18.
- **Depends:** T01.
- **Acceptance:**
  - `docker-compose.yml` has a `db` service (`pgvector/pgvector:pg16`) with a healthcheck, and `jarvis` and `jarvis_test` databases.
  - `server/src/config.ts` reads `DATABASE_URL`, `LLM_PROVIDER`, `GEMINI_API_KEY` (required only for gemini), model ids, the price table, `RETRIEVAL_MIN_SCORE`, `DAILY_BUDGET_USD` and `COOKIE_SECURE`, and fails fast on missing or invalid values.
  - `.env.example` is committed.
- **Verify:** `docker compose up -d db`, then `docker compose exec db psql -U postgres -d jarvis -c "create extension if not exists vector; select extversion from pg_extension where extname='vector'"` shows ≥ 0.8; a config unit test covers a missing key.

### [ ] T03 · Database schema and migration
- **Goal:** every §6 table with its constraints.
- **Refs:** §6, §4.4 categories, C6, C19.
- **Depends:** T02.
- **Acceptance:**
  - Drizzle schema plus generated migration for: `users`, `sessions`, `documents`, `document_versions`, `document_files`, `document_chunks` (`vector(768)`, no ANN index), `questions`, `answer_drafts`, `draft_sources`, `answer_reviews` and `provider_calls`.
  - Enum `CHECK`s, uniques, cascades, `ON DELETE SET NULL` for `draft_sources.chunk_id` and `documents.active_version_id`, and the (`status`, `created_at`) index.
- **Verify:** `pnpm db:migrate` works on an empty DB and is a no-op on a second run. The schema test checks that an invalid category, a duplicate `answer_reviews.question_id`, and deleting a document (cascading to versions, files and chunks) behave as specified.

### [ ] T04 · Fastify app baseline
- **Goal:** a hardened HTTP shell that every route builds on.
- **Refs:** §9 (CSP, CSRF, logging).
- **Depends:** T02.
- **Acceptance:**
  - `buildApp()` factory with request ids, a log allow-list (request id, route, user id, status, latency; no bodies) and a uniform error shape.
  - `@fastify/helmet` with CSP `default-src 'self'`.
  - Mutating requests whose `Origin` isn't the app origin get 403.
  - A test helper builds the app against `jarvis_test` and truncates tables.
- **Verify:** `pnpm --filter server test baseline`: a POST with a foreign `Origin` returns 403, the CSP header is present, and the captured log output contains no request body.

### [ ] T05 · Authentication and roles
- **Goal:** agents and customers can log in; routes are guarded by role.
- **Refs:** §2, §9 Authentication/Authorization, C17, C18, C9.
- **Depends:** T03, T04.
- **Acceptance:**
  - argon2id hashes; sessions store only a token hash.
  - The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` (per config) and expires after 12 h; logout deletes the session.
  - Login is limited to 5 attempts per minute per email + IP.
  - `/api/agent/*` is for agents only and `/api/portal/*` for customers only.
  - `GET /api/me` returns the role and the `simulated` flag.
  - The user seed creates 2 agents and the 6 mock customers, with plan and profile but no employee names (C13).
- **Verify:** `pnpm --filter server test auth`. The test covers:
  - a wrong password returns 401;
  - the 6th attempt within a minute returns 429;
  - a customer calling an agent route gets 403, and vice versa;
  - an expired session returns 401;
  - the `sessions` row doesn't contain the raw token.

### [ ] T06 · Frontend shell, routing and mock cleanup
- **Goal:** the real app shell: login, two route trees, and the mock pruned per §13.
- **Refs:** §10, §13 Remove and Fix (rename), C4, C5, C9, C14.
- **Depends:** T05.
- **Acceptance:**
  - React Router with `/login`, `/console/*` (agents) and `/portal/*` (customers); wrong-role users are redirected.
  - A `fetch` helper sends credentials and surfaces API errors; the Vite dev proxy forwards `/api` to the API.
  - The console header says "Jarvis" and the portal says "SubPilot Support".
  - Fonts are self-hosted and the Google Fonts import is gone.
  - Removed: Evaluations nav, speed and failure simulation, Load demo data, Request review, re-approval and Earlier approvals, the 3-step progress, and the indexing sub-step bars.
  - The "DEMO DATA" bar appears only when `simulated` is true, labelled **SIMULATED AI**.
- **Verify:** `pnpm --filter frontend build` passes. Manually: log in as an agent and land on `/console`; log in as a customer and land on `/portal`; logout returns to `/login`. `grep -ri "fonts.googleapis\|Evaluations\|Load demo" frontend/src` returns nothing.

## Phase 1 — Questions without AI

### [ ] T07 · Portal questions API
- **Goal:** customers submit and read their own questions.
- **Refs:** §4.1, §8 customer limits, §9 IDOR, C11.
- **Depends:** T05.
- **Acceptance:**
  - `POST /api/portal/questions` validates subject ≤ 120 and body ≤ 2,000 characters (Fastify schema), allows 20 per UTC day, and creates the question as `new`.
  - `GET /api/portal/questions` and `GET /api/portal/questions/:id` return the session user's questions only, with status Received/Answered.
  - The answer is included only when the question is answered, with markers stripped.
  - The seed adds the 6 mock questions.
- **Verify:** `pnpm --filter server test portal`. The test covers:
  - customer A reading customer B's question gets 404;
  - the 21st question in a day gets 429;
  - a 2,001-character body gets 400;
  - the answer text contains no `[n]` markers.

### [ ] T08 · Portal UI
- **Goal:** a responsive customer portal.
- **Refs:** §4.1, §1 assumptions (responsive), C4.
- **Depends:** T06, T07.
- **Acceptance:**
  - Ask form with character counters and server error display.
  - List of own questions with Received/Answered; the answer is shown as plain text.
  - No Jarvis branding, and no drafts or evidence.
  - Works at 375 px with no horizontal scroll.
- **Verify:** manual check at 375 px and 1280 px; submit a question and see it listed as Received.

### [ ] T09 · Inbox API
- **Goal:** agents list and open questions.
- **Refs:** §4.2, §4.3 customer context, §6 stale SQL.
- **Depends:** T05, T07.
- **Acceptance:**
  - `GET /api/agent/questions?status=` returns rows newest first, each with customer, company, subject/body, plan, received time, status and `stale` (latest draft, using the §6 SQL).
  - The response includes the unanswered count.
  - `GET /api/agent/questions/:id` returns the question and the customer record.
- **Verify:** `pnpm --filter server test inbox`: ordering, the status filter and the count are correct; `stale` is false when no draft exists.

### [ ] T10 · Inbox and question pane UI
- **Goal:** the mock inbox and the workspace's left pane, on real data.
- **Refs:** §4.2, §4.3 customer context, §13 Fix (context note), C14.
- **Depends:** T06, T09.
- **Acceptance:**
  - Status filters (New / Draft ready / Needs review / Answered), the "Source updated" flag and the nav badge come from the API.
  - The question pane shows the customer record, and the note says only plan and profile attributes are sent.
  - Prev/next navigation works. The draft and evidence panes show a placeholder.
- **Verify:** manual: a question submitted in the portal appears at the top of the inbox and the badge count goes up by one.

## Phase 2 — Knowledge base and indexing

### [ ] T11 · Provider module (Gemini and stub)
- **Goal:** one interface for embeddings and generation, with cost tracking.
- **Refs:** §5.1.5, §5.2.3, §5.2.7, §5.3, §7, §8 (retries, budget), C9, C10.
- **Depends:** T03.
- **Acceptance:**
  - `embedDocuments` (one `Content` per chunk), `embedQuery` and `generate` (response schema, lowest thinking level, `maxOutputTokens` 2048, 20 s timeout, ≤ 2 retries on 429/5xx/timeout with backoff and jitter; a truncated response counts as a failure).
  - Each call writes a `provider_calls` row with tokens, cost from the price table, latency and an error code, and never stores text.
  - `budgetRemaining()` sums today's cost.
  - The stub returns deterministic embeddings and scripted generations.
  - **Spike:** confirm the current model ids, the 768-dim setting, the task-format input and the thinking config against the `@google/genai` docs, and record the findings in REQ_V2 §7 (C10).
- **Verify:** `pnpm --filter server test provider`:
  - a 500 → 500 → 200 sequence makes 3 attempts;
  - a 400 makes 1 attempt;
  - a truncated response throws;
  - cost is computed from the price table.

  Spike, manual: `LLM_PROVIDER=gemini pnpm --filter server exec tsx scripts/smoke-embed.ts` prints dimension 768.

### [ ] T12 · Upload and replace API
- **Goal:** agents can upload documents and new versions; versions are queued.
- **Refs:** §4.4 Upload/Replace/Effective date, §5.1.1, §8 uploads, §9 Uploads, §12 #6.
- **Depends:** T05, T03.
- **Acceptance:**
  - `POST /api/agent/documents` (multipart: file, title, category, effective date, note) and `POST /api/agent/documents/:id/versions`.
  - Checks: extension plus magic bytes (PDF or Markdown only), ≤ 10 MB, effective date ≤ today.
  - Replace is rejected while another version is queued or processing, and when the hash matches the active version.
  - The file is stored in `document_files` and the version created as `queued`.
- **Verify:** `pnpm --filter server test upload`. The test covers:
  - a `.pdf` with PNG bytes returns 400;
  - an 11 MB file returns 413;
  - a future effective date returns 400;
  - a duplicate hash returns 409;
  - a replace while another version is queued returns 409.

### [ ] T13 · Sandboxed extractors
- **Goal:** text extraction that is isolated and fails safely.
- **Refs:** §5.1.3, §9 Uploads.
- **Depends:** T01.
- **Acceptance:**
  - One child process per file, with a 60 s timeout, a memory cap and `env: {}`.
  - **PDF:** per-page text with page numbers, using `pdfjs-dist` with `isEvalSupported: false`. Encrypted files, files over 100 pages and pages without text are rejected with messages like "Page 3 has no text layer. OCR isn't supported."
  - **Markdown:** UTF-8 only, ≤ 300,000 characters, headings from `#`–`###` lines, ignoring lines inside code fences.
  - Small handwritten fixtures in `server/test/fixtures/`.
- **Verify:** `pnpm --filter server test extract`. The test covers:
  - a text PDF returns its pages;
  - a PDF with an empty page 3 gives that exact message;
  - a hanging extractor is killed at the timeout;
  - the child's `process.env` is empty;
  - a `#` inside a code fence isn't treated as a heading.

### [ ] T14 · Chunker
- **Goal:** passages sized for retrieval.
- **Refs:** §5.1.4.
- **Depends:** T13.
- **Acceptance:**
  - One chunk per Markdown section or PDF page.
  - Chunks over ~500 tokens (characters ÷ 4) are split at paragraph boundaries.
  - Each chunk keeps its heading path and page number.
- **Verify:** `pnpm --filter server test chunk`: a 3,000-character section splits on a blank line, and nested headings produce "A > B".

### [ ] T15 · Indexing worker
- **Goal:** queued versions become active, or fail without side effects.
- **Refs:** §5.1.2, §5.1.6–7, §4.4 Activation/Retry, §8 budget, §11 indexing test, C2, C12.
- **Depends:** T11, T12, T14.
- **Acceptance:**
  - `pnpm worker` claims versions with `FOR UPDATE SKIP LOCKED`, then runs extract → chunk → embed.
  - Activation is one transaction (chunks + `ready` + `active_version_id`, only if the version number is higher; C2).
  - Errors set `failed` with a short message that contains no document text.
  - A retry deletes partial chunks first.
  - Versions stuck in `processing` for more than 10 minutes become `failed`.
  - Budget reached → `failed` (C12).
- **Verify:** `pnpm --filter server test worker`. The test covers:
  - a failed v3 leaves v2 active;
  - two workers never claim the same version;
  - after a retry, chunk count = new chunks only;
  - a stale `processing` version becomes `failed`.

### [ ] T16 · KB management API
- **Goal:** list, inspect, archive, delete and download documents.
- **Refs:** §4.4 List/Archive/Delete/Document page/Retry, §9 Files and deletion, C2.
- **Depends:** T15.
- **Acceptance:**
  - `GET /api/agent/documents` supports `ILIKE` search over titles and active-version chunk text, a category filter and `archived=1`.
  - `GET /api/agent/documents/:id` returns the version history and each version's content built from its chunks.
  - `POST …/archive` and `…/restore`.
  - `POST …/versions/:vid/retry` works only for the latest version when it has failed.
  - `GET …/impact` returns counts of open drafts and published answers.
  - `DELETE` removes everything in one transaction.
  - `GET …/versions/:vid/file` sends `Content-Disposition: attachment` and `nosniff`.
- **Verify:** `pnpm --filter server test kb`. The test covers:
  - search matches chunk text from the active version only;
  - retry on a non-latest version returns 409;
  - after delete, files, chunks and versions are gone and published answers are unchanged;
  - download as a customer returns 403.

### [ ] T17 · Knowledge base UI
- **Goal:** the mock KB list, on the real API.
- **Refs:** §4.4, §10 polling, §13 Add (upload form, delete, download) / Remove (progress bars).
- **Depends:** T06, T16.
- **Acceptance:**
  - Search, category tags, Show archived.
  - Real upload and replace forms (file, title, category, effective date, note) with server errors shown inline.
  - Status badges only; polls every 3 s while any version is queued or processing.
  - Retry, Archive/Restore, and Delete with a confirmation that shows the impact count.
- **Verify:** manual with the stub provider and `pnpm worker` running: upload a `.md`, watch Queued → Processing → Ready without reloading; delete it and the confirmation shows the counts.

### [ ] T18 · Document page UI
- **Goal:** inspect any version.
- **Refs:** §4.4 Document page, §13 Add (download).
- **Depends:** T17.
- **Acceptance:**
  - Version content shown as plain text, with page numbers for PDFs.
  - History marks active / previous / indexing / failed (with error).
  - Download link for the original; "View current" when viewing an older version.
- **Verify:** manual: open the failed seed document; the error text is visible and Retry is offered.

### [ ] T19 · KB fixtures and seed
- **Goal:** `pnpm seed` reproduces the mock's knowledge base.
- **Refs:** §11 Seed, §13 Remove (Load demo data), §13 Fix (Brazil, refund), C13.
- **Depends:** T15, T05, T07.
- **Acceptance:**
  - `fixtures/kb/` has the 6 mock documents as Markdown, the scanned "Failed payment retries" PDF, and `refund-policy-v3.md` (not seeded; used by the replace demo and eval).
  - `pnpm seed` resets the DB and seeds users, questions and queued versions.
- **Verify:** `pnpm seed && pnpm worker --once` gives 6 documents Ready and 1 Failed with "Page … has no text layer"; running it twice gives the same result.

## Phase 3 — Draft generation and approval

### [ ] T20 · Retrieval
- **Goal:** the access filter lives in SQL.
- **Refs:** §5.2.4, §6 Retrieval, §9 Authorization.
- **Depends:** T15.
- **Acceptance:**
  - Top 8 by exact cosine distance; active versions of non-archived documents only, with a matching `embedding_model`.
  - Drop rows below `RETRIEVAL_MIN_SCORE`.
- **Verify:** `pnpm --filter server test retrieval`: passages from a superseded version, an archived document or another `embedding_model` are never returned, and the threshold removes low scores.

### [ ] T21 · Prompt builder and normaliser
- **Goal:** pure functions for the model input and output.
- **Refs:** §4.3 label table and conflict precedence, §5.2.6, §5.2.8, §5.3, §8 input context, C1, C3.
- **Depends:** T01.
- **Acceptance:**
  - Versioned system instructions (§5.3 rules).
  - Passages labelled `S1…Sk` with their metadata.
  - Context contains only plan, profile, `today` and `question_received_at`.
  - The question is delimited as untrusted text.
  - Lowest-ranked passages are dropped to stay within 6,000 tokens (characters ÷ 4).
  - Normaliser: drop unknown `S` ids, renumber `[1]…[n]`, number conflict sources (C1), compute the label.
- **Verify:** `pnpm --filter server test prompt normalise`. The test covers:
  - the prompt never contains name, email or company;
  - over budget drops the last passage;
  - `[S9]` with 3 passages is removed and gives `needs_review`;
  - no valid citations gives `missing_evidence`;
  - an uncited conflict source gets number n+1.

### [ ] T22 · Generate endpoint
- **Goal:** `POST /api/agent/questions/:id/drafts` produces a saved draft or changes nothing.
- **Refs:** §5.2, §8 quotas and budget, §3 flow, §11 generation tests.
- **Depends:** T11, T20, T21, T09.
- **Acceptance:**
  - Checks: unanswered, quota of 30 per UTC day, budget.
  - Lock via `generation_started_at` (409 if held).
  - Embed the query and retrieve.
  - No passages → empty `missing_evidence` draft without calling the model.
  - Otherwise generate, then save the draft, `draft_sources` (cited and uncited) and the `customer_context` the model saw.
  - Set the status, clear the lock and return the draft.
  - On failure: no draft, status unchanged, lock cleared, error recorded.
- **Verify:** `pnpm --filter server test generate`. The test covers:
  - an off-topic question gives a draft with no `generate` row in `provider_calls`;
  - a concurrent second call gets 409;
  - a stub failure leaves status and draft count unchanged;
  - the 31st draft of the day gets 429.

### [ ] T23 · Draft read and edit API
- **Goal:** the workspace's data for the draft and evidence panes.
- **Refs:** §4.3 Evidence cards, Banners, Actions (Edit), C1, C15, C16.
- **Depends:** T22.
- **Acceptance:**
  - `GET …/drafts/latest` returns the text, label, unknowns and conflicts (as citation numbers), `stale`, `generating`, and evidence cards with title, category, version, effective date, heading, page, text and a Superseded/Archived/Deleted badge.
  - `PATCH …/drafts/:did` saves `edited_text` and rejects any `[n]` without a citation. `answer_text` never changes.
- **Verify:** `pnpm --filter server test draft`. The test covers:
  - an edit with `[7]` returns 400;
  - `answer_text` is unchanged after an edit;
  - archiving the cited document makes `stale` true and the badge "Archived";
  - deleting it gives the badge "Deleted".

### [ ] T24 · Approve and publish API
- **Goal:** the API enforces every approval rule.
- **Refs:** §4.3 Approve 1–4, §3 step 5, §1 success criterion, §11 approval tests, C6, C15.
- **Depends:** T23.
- **Acceptance:**
  - `POST …/approve {draftId, conflictsAcknowledged}` returns 409 for: generating, not the latest draft, already answered, empty text, stale, or conflicts not acknowledged.
  - One transaction inserts `answer_reviews` (final text and snapshot with document and version ids) and sets the question to `answered` with `answered_at`.
- **Verify:** `pnpm --filter server test approve`. The test covers:
  - a superseded source, an archived document and a deleted document each give 409;
  - a conflict without acknowledgement gives 409, and with acknowledgement gives 200;
  - two concurrent approvals give one 200 and one 409;
  - the portal then shows the answer without markers.

### [ ] T25 · Workspace UI on the real API
- **Goal:** the mock's draft and evidence panes, end to end.
- **Refs:** §4.3 (all), §13 Add (regenerate confirmation, empty missing-evidence state, page and Archived badges) / Fix (archived counts as stale), C14, C16.
- **Depends:** T10, T24.
- **Acceptance:**
  - Generate and Regenerate, with a confirmation when an edit would be lost ("Your edit won't carry over").
  - "Generating…" while the call runs; on failure, Retry.
  - Label badge; conflict banner (topic, which source was followed); unknowns banner; Source updated banner.
  - An empty draft shows "No documented answer — write the reply" and opens the editor.
  - Edit errors are shown from the API.
  - The Approve button is disabled with the same hints as the API rules; acknowledgement checkbox for conflicts.
  - Approval record and historical note.
  - The mock hook `useSubPilot` is deleted.
- **Verify:** manual with the stub. In the browser: generate → edit → approve → see the answer in the portal; archive the cited document and Approve becomes disabled with a hint. `grep -r useSubPilot frontend/src` returns nothing.

### [ ] T26 · Should items
- **Goal:** "Cited in answers", and the toast after activation.
- **Refs:** §4.4 Should items, C6.
- **Depends:** T18, T25.
- **Acceptance:**
  - The document page lists drafts and published answers that cite it (published answers come from snapshot ids).
  - When polling sees a version become ready, a toast says "N drafts cite the previous version" and links to the first one.
- **Verify:** manual: replace the Refund policy with `fixtures/kb/refund-policy-v3.md`; the toast appears and links to the refund-request question.

## Phase 4 — Evaluation and delivery

### [ ] T27 · Golden set and `pnpm eval`
- **Goal:** measure the §1 success criteria and pick the model and threshold.
- **Refs:** §1 success criteria, §11 Golden set, §12 #3, §7, C1, C3, C9, the unknowns risk.
- **Depends:** T22, T19.
- **Acceptance:**
  - `eval/golden.json` holds the 9 §11 cases.
  - `pnpm eval` seeds an eval DB, indexes it with Gemini, applies refund v3 for the "after v3" case, and reports the retrieval hit rate, label accuracy, invalid citations, cost and p95 latency.
  - It refuses to run with `LLM_PROVIDER=stub`.
  - `RETRIEVAL_MIN_SCORE` and the model id are calibrated and committed.
- **Verify:** `LLM_PROVIDER=gemini pnpm eval` reports hit rate ≥ 90%, label accuracy ≥ 80% and p95 ≤ 15 s. Results are pasted into this task.

### [ ] T28 · Docker delivery
- **Goal:** `docker compose up` runs the full demo.
- **Refs:** §10 Deploy, §9 CSP.
- **Depends:** T25, T19.
- **Acceptance:**
  - A multi-stage Dockerfile; compose runs `db`, `api` and `worker`.
  - `api` serves the built frontend, with an SPA fallback for `/login`, `/console/*` and `/portal/*`.
  - Migrations run on start.
- **Verify:** `docker compose up --build -d && docker compose exec api pnpm seed`. Then `curl -sI localhost:8080/console | grep -i content-security-policy` matches; log in through the browser at `localhost:8080`.

### [ ] T29 · Release check
- **Goal:** confirm v1 is done.
- **Refs:** §1, §9 Logging, §11 Automated tests.
- **Depends:** T26, T27, T28.
- **Acceptance:**
  - All §11 automated tests pass.
  - The §1 criteria are met (from T27).
  - A log sample from a full flow contains no question text, draft text or document text.
  - Every §13 item is ticked.
- **Verify:** `pnpm test`; `docker compose logs api worker | grep -c "Hi, we are on Pro"` returns 0; review the §13 checklist.
