# Jarvis — RFP Workspace · Implementation Tasks (V3)

Source of truth: `REQ_V3.MD` v3.0 (cited as §n, IDs as `AREA-NN`). REQ_V2 and `TASKS.md` still govern Ask / History / KB.
Mark a task `[x]` only when every acceptance check passes. Each task = one PR with code, migration (if any), tests and UI together.

Conventions from `TASKS.md` apply: server tests use the stub provider and `jarvis_test`; CI never calls Gemini; no prompt, answer or document text in logs or `provider_calls`.

---

## 1. Current State

The repo is a finished MVP (TASKS T00–T29) of **Jarvis**, an internal support copilot: React/Vite/Tailwind frontend, Fastify + Drizzle + zod server, Postgres 16 + pgvector, a separate worker process, Gemini behind a provider interface with a deterministic stub, Docker Compose, Vitest (~140 server tests), and a golden-set eval.

What exists and how V3 uses it:

| Area | Where | V3 |
|---|---|---|
| Upload validation (PDF magic bytes, strict UTF-8 Markdown, 3 MB) | `server/src/upload.ts` | **Reuse**; add `.txt` |
| Sandboxed extraction (child process, timeout, `env: {}`), PDF per page with blank-page warnings, Markdown headings | `server/src/extract*.ts`, `extract/` | **Reuse** for KB `.txt` and RFP files |
| Chunker (section/page, ~500 tokens, heading path) | `server/src/chunk.ts` | **Reuse** unchanged |
| Worker: `SKIP LOCKED` claim, activation transaction, stale-processing recovery, reservation sweeper | `server/src/worker.ts` | **Reuse loop**; add an RFP-question claim. **B05 open**: one embed call per document, silent vector fallback (`worker.ts:153`) |
| Document model with versions, active-version filter, `created_by`, archive/delete | `server/src/db/schema.ts`, `documents.ts` | **Reuse**; add 2 categories |
| Retrieval: exact cosine top 8, access filter in SQL, min score; stub token overlap | `server/src/retrieve.ts` | **Reuse** unchanged. Hybrid is already planned as TASKS T40/T41 |
| Provider interface (`embedDocuments`, `embedQuery`, `generate`), Gemini JSON-schema output, zod validation, retries, deadline, truncation = failure | `server/src/llm/` | **Extend**: `generate` is hard-wired to the Ask schema (`llm/schema.ts`) — add a schema-parameterised call |
| Budget reservation/reconciliation, `provider_calls` (latency, tokens, cost, error code, no text) | `server/src/llm/budget.ts` | **Reuse** as the observability store; add `rfp_generate` kind + `rfp_question_id` |
| Citation normalisation (`[S#]` validation, renumbering, grouped markers B04, `stripMarkers`) | `server/src/normalise.ts` | **Reuse**; extract the S-marker part if calling `normalise` with no facts is awkward |
| Ownership lock with token (`generation_token`), T1/T2 short transactions, no txn during LLM calls | `server/src/generate.ts` | **Copy the pattern** for questions |
| Edit validation (markers can be removed, not added), staleness query (§7.6) | `server/src/review.ts`, `conversations.ts` | **Copy the pattern** |
| Auth, sessions, Origin check, CSP, log allow-list, error shape | `server/src/app.ts`, `auth.ts` | **Reuse** unchanged |
| Evidence cards, draft text with `[n]` markers, KB views, toasts, polling hook pattern | `frontend/src/features/workspace/EvidencePanel.jsx`, `DraftText.jsx`, `features/kb/*`, `hooks/useDocuments.js` | **Reuse** components |
| Eval harness (guards, budget estimate, seeding `jarvis_eval`, report) | `server/eval/run.ts`, `score.ts` | **Reuse** guards and seeding |
| Account facts, snapshot, signals, clarifications, conversations | `context.ts`, `state.ts`, … | **Not used** by V3. Left untouched |

Gaps V3 must fill: no RFP / question / review entities, no question extraction, no batch generation, no schema-agnostic LLM call, no evidence status, no `.txt`, no company/security knowledge fixtures, no per-question observability, no export.

Pending work that collides with V3: **M10 server refactor (T30–T37)** moves the files V3 builds on; **BUGS B05**. See REQ_V3 §2 (V3-D7, V3-D8).

---

## 2. Target Architecture

Same three processes. No new services, no queue broker, no agents.

```text
                    ┌──────────────────────── Browser (React) ────────────────────────┐
                    │  /kb (existing)        /rfps  /rfps/new  /rfps/:id  (new)        │
                    └───────────────┬──────────────────────────────┬──────────────────┘
                                    │ JSON / multipart             │ poll 3 s
┌───────────────────────────────── api (Fastify) ─────────────────────────────────────┐
│ routes/rfps.routes.ts ──▶ services/rfp.service.ts        create, extract, confirm,   │
│                           services/rfp-extract.ts        edit, review, export        │
│                           services/rfp-answer.service.ts answerQuestion() ◀─┐        │
│ documents.ts / upload.ts (existing KB)                  regenerate (sync) ──┘        │
└──────────┬───────────────────────────────────────────────────────┬──────────────────┘
           │                                                       │
           ▼                                                       ▼
┌──────────────────── Postgres + pgvector ───────────────┐   ┌─── worker (existing) ────────┐
│ documents · document_versions · document_chunks (KB)   │◀──│ 1. claim queued KB version   │
│ rfps · rfp_questions (status = queue)                  │   │ 2. else claim queued question │
│ rfp_answers · rfp_answer_sources · rfp_reviews         │   │    → answerQuestion()         │
│ provider_calls (latency, tokens, cost, rfp_question_id)│   │ 3. sweep stale / abandoned    │
└────────────────────────────────────────────────────────┘   └──────────────┬───────────────┘
                                                                            │
answerQuestion(q):  retrieve() ──▶ 0 passages? ──yes──▶ INSUFFICIENT (no LLM)│
                        │no                                                  │
                        ▼                                                    ▼
                 buildRfpPrompt ──▶ provider.generateStructured(schema) ──▶ Gemini / stub
                        ▼                                   (paidAttempt: reserve → call → reconcile)
                 normalise citations ──▶ evidence-status rules (only downgrade)
                        ▼
                 short txn: token matches? → insert answer + sources, status done
```

Key properties:
- **Traceability:** every retrieved chunk is stored per answer with plain document/version values; citations are numbers into that list.
- **Determinism around the LLM:** extraction, citation validation, evidence-status rules, review rules and export are code. The LLM does one thing: draft an answer as JSON.
- **Retryable units:** the question is the unit of processing, retry and review.
- **Retrieval seam:** `retrieve(vector, opts)` already returns `Passage[]`; hybrid (T40) and a rerank step plug in there without touching the RFP code. `retrieval_mode` is recorded per answer.

---

## 3. Implementation Strategy

1. **Schema first, once (TASK-01).** All V3 tables and enum changes in one migration owner task, so later tasks don't fight over the Drizzle journal and parallel branches don't produce conflicting migrations.
2. **Walking skeleton next (TASK-02 → TASK-05).** One RFP with hardcoded questions sent as JSON → synchronous generate of one question against the *existing* seeded KB (the SSO guide and plan comparison already answer "Do you support SAML SSO?") → structured LLM output → validated citations → persisted answer + sources → visible in a minimal UI with evidence cards. This proves schema, provider extension, retrieval reuse, citation rules and UI before anything else.
3. **Then scale to many questions (TASK-06, TASK-07).** Deterministic extraction and background processing reuse `answerQuestion()` from the skeleton unchanged; the worker is the only new caller.
4. **Then the review loop (TASK-08, TASK-09).** Feedback capture is what makes the product more than a chatbot, and it's what evaluation reads.
5. **Then quality and reliability (TASK-10 → TASK-12).** Better knowledge fixtures, `.txt`, B05 and observability. These improve a working system instead of delaying the first demo.
6. **Then measurement and demo (TASK-13 → TASK-16).** Golden set and feedback report; hybrid and LLM extraction only if the numbers say so.

New code goes straight into the M10 layout (`routes/` → `services/`), so M10 can later move only the old modules.

---

## 4. Task List

### Milestone 1 — Domain and persistence

### TASK-01 — Spec approval and V3 schema

**Goal**

All V3 entities and enum changes exist in the database; the repo docs point to V3.

**Why**

Every other task reads or writes these tables. One migration owner avoids conflicting Drizzle journals when tasks run in parallel.

**Implementation**

- Get REQ_V3 §2 V3-D1–D8 approved; strike through any rejected item in REQ_V3 and adjust affected tasks here.
- `server/src/db/schema.ts`: add `rfps`, `rfp_questions`, `rfp_answers`, `rfp_answer_sources`, `rfp_reviews` exactly as REQ_V3 §5.3, with constants `RFP_STATUSES`, `QUESTION_STATUSES`, `EVIDENCE_STATUSES`, `REVIEW_VERDICTS`.
- `CATEGORIES` += `Company`, `Compliance`; `CALL_KINDS` += `rfp_generate`; `provider_calls.rfp_question_id` FK `ON DELETE SET NULL`.
- Indexes: `rfp_questions (status, rfp_id, seq)` for the claim; `rfps (created_by, created_at desc)`; `rfp_answers (question_id, id desc)`; `rfp_reviews (answer_id, id desc)`.
- `pnpm --filter server exec drizzle-kit generate` → `server/drizzle/0001_rfp.sql`.
- `CLAUDE.md`, `AGENTS.md`: add REQ_V3.MD / TASKS_V3.md as the sources for the RFP workspace (V3-D1).

**Acceptance criteria**

- [ ] `pnpm db:migrate` applies on the current schema and is a no-op on a second run
- [ ] Deleting an RFP cascades to questions, answers, sources and reviews; deleting a document sets `rfp_answer_sources.chunk_id` to null and keeps `document_id`/`version_id`
- [ ] Duplicate (`rfp_id`, `seq`) is rejected; invalid `evidence_status`/`verdict`/`status` values are rejected
- [ ] A document with category `Compliance` can be inserted
- [ ] `server/test/schema.test.ts` extended with the cases above

**Dependencies**

None.

**Complexity**

M

---

### Milestone 2 — Walking skeleton: one question end to end

### TASK-02 — Structured LLM call and RFP answer contract

**Goal**

A provider call that returns any zod-validated JSON shape, and the RFP prompt + response schema built on it.

**Why**

`Provider.generate` is hard-wired to the Ask schema (`llm/schema.ts`, `gemini.ts`). RFP answers (and later LLM extraction / judge) need their own schema without copying the retry, timeout, truncation and budget logic.

**Implementation**

- `server/src/llm/types.ts`: add `generateStructured<T>({ prompt, schema, jsonSchema }, deadline)` to `Provider`.
- `server/src/llm/gemini.ts`: implement by generalising the existing `generate` body (pass `responseJsonSchema` from the input; zod-parse; truncation and parse errors → `ProviderError('INVALID_OUTPUT')`, which `isRetryable` treats like 5xx). Re-implement the existing `generate` as a thin call to it with the Ask schema — no behaviour change for Ask.
- `server/src/llm/stub.ts`: `generateStructured` dispatches by a `stubKind` field: for `rfp`, return `HIGH_EVIDENCE` with "Simulated: <first sentence of S1> [S1]" when the prompt contains `S1 |`, else `INSUFFICIENT_EVIDENCE`.
- `server/src/rag/rfp-prompt.ts` (new): `buildRfpPrompt({ question, section, passages })` per REQ_V3 §7.3, `RFP_PROMPT_VERSION = 'rfp-v1'`, same 6,000-token passage dropping as `prompt.ts` (reuse `estimateTokens`).
- `server/src/llm/rfp-schema.ts`: zod schema REQ_V3 §7.4 + JSON schema via `z.toJSONSchema`.

**Acceptance criteria**

- [ ] Existing `provider.test.ts` and `generate.test.ts` pass unchanged (Ask unaffected)
- [ ] `generateStructured` with a malformed JSON response retries and then throws `INVALID_OUTPUT`; a truncated response throws; a 400 makes one attempt
- [ ] `buildRfpPrompt` drops the lowest passage when over budget, marks the question as untrusted, contains no employee name/email (RFP-PRM-01)
- [ ] New `server/test/rfp-prompt.test.ts`; provider tests extended

**Dependencies**

TASK-01 (only for the `rfp_generate` kind constant; can start in parallel and rebase).

**Complexity**

M

---

### TASK-03 — RFP create / read API (questions as JSON)

**Goal**

An employee can create an RFP with a given list of questions and read it back with ownership enforced.

**Why**

The skeleton needs a container for questions before extraction exists. Hardcoded/JSON questions keep extraction off the critical path.

**Implementation**

- `server/src/routes/rfps.routes.ts` + `server/src/services/rfp.service.ts` (M10 layout from day one, no `db/` import in the route).
- `POST /api/rfps` JSON `{ title, questions: [{text, section?}] }` (1–50, each 1–2,000 chars) → RFP in `confirmed` state with `pending` questions. *(TASK-06 adds the paste/file path and the `draft` step.)*
- `GET /api/rfps?mine=1`, `GET /api/rfps/:id` returning questions with derived review state (REQ_V3 §4.4, TS function `deriveQuestionState` in `services/rfp-state.ts`), latest answer, sources, reviews, `ownedByMe`.
- `requireOwner` reused from `generate.ts` (or moved to `services/` if T35 has landed).
- Register in `app.ts`.

**Acceptance criteria**

- [ ] Create → 201 with questions in order; 51 questions → 400; unauthenticated → 401; foreign Origin → 403
- [ ] Employee B can read A's RFP (`ownedByMe: false`); `mine=1` lists only own RFPs
- [ ] `deriveQuestionState` unit tests cover every row of REQ_V3 §4.4
- [ ] New `server/test/rfp-api.test.ts`

**Dependencies**

TASK-01.

**Complexity**

S

---

### TASK-04 — `answerQuestion` pipeline and synchronous regenerate

**Goal**

`POST /api/rfp-questions/:id/regenerate` turns one question into a persisted answer with cited sources and an evidence status, or fails cleanly.

**Why**

This is the core of the product and the function the worker will call later. Building it synchronously first makes it easy to test and demo.

**Implementation**

- `server/src/services/rfp-answer.service.ts`:
  - `takeQuestionLock(id, token)` (UPDATE … WHERE token null or stale, like `generate.ts:takeLock`), sets `processing`, `attempts + 1`.
  - `answerQuestion(questionId, token, deps)` outside any transaction: embed query via `paidAttempt` (`embed_query`, `rfp_question_id`) → `retrieve()` (stub: lexical, as `generate.ts`) → **zero passages → fixed INSUFFICIENT answer, no LLM call** (RFP-RET-02) → `buildRfpPrompt` → `paidAttempt` per attempt with `kind: 'rfp_generate'` and retries (copy `paidGenerate` loop) with a 90 s deadline → normalise citations (reuse `normalise()` with `facts: []`, or extract `resolveCitations` from `normalise.ts`) → `applyEvidenceRules()` (REQ_V3 §8, pure function).
  - Save in one short transaction: `SELECT … FOR UPDATE` on the question, token must match, insert `rfp_answers` + **all** retrieved passages into `rfp_answer_sources` (cited ones with `citation_number`, chunk id resolved inside the insert like GEN-05, plus plain document/version/title/heading/page), set `done`, clear token.
  - Failure: `failed`, `error_code`, clear token if it matches; previous answer untouched.
- Route in `rfps.routes.ts`: creator only, 409 if `queued`/`processing`.
- `retrieval_mode = 'vector'` (or `'stub-lexical'`) recorded.

**Acceptance criteria**

- [ ] Stub: "Do you support SAML SSO?" against the seeded KB → `done`, answer with `[1]`, `rfp_answer_sources` holds every retrieved passage and exactly the cited one has `citation_number`
- [ ] A question with no matching passage → `INSUFFICIENT_EVIDENCE`, `model = 'none'`, no `rfp_generate` row
- [ ] `applyEvidenceRules` unit tests for every REQ_V3 §8 row (EVS-01)
- [ ] Stub `INVALID_OUTPUT` × 3 → `failed` with `INVALID_OUTPUT`, 3 `provider_calls` rows with `rfp_question_id`, no answer row, lock cleared
- [ ] A taken-over token cannot save; B regenerating A's question → 403, nothing written
- [ ] While a stubbed call is blocked, archiving a cited document completes immediately (no txn held, GEN-01)
- [ ] New `server/test/rfp-answer.test.ts`

**Dependencies**

TASK-02, TASK-03.

**Complexity**

L

---

### TASK-05 — Minimal RFP workspace UI

**Goal**

The employee opens an RFP, clicks Generate on a question, and sees the draft, its evidence status and evidence cards.

**Why**

Completes the walking skeleton: the architecture is proven only when the answer is visible and traceable in the browser.

**Implementation**

- `frontend/src/features/rfp/RfpListView.jsx`, `RfpWorkspaceView.jsx`; `frontend/src/hooks/useRfps.js` (fetch + refresh, pattern of `useDocuments.js`); `lib/api.js` calls.
- Routes `/rfps`, `/rfps/:id` in `App.jsx`; sidebar item **RFPs**.
- Workspace: left question list with state chips; centre question + answer via `DraftText` (`[n]` markers), evidence-status label with the EVS-02 wording and tooltip, gaps; **Generate / Regenerate** button; right: evidence cards — extract `EvidenceCard` from `EvidencePanel.jsx` into `features/workspace/EvidenceCard.jsx` and reuse it.
- Temporary "Create sample RFP" button on `/rfps` that posts 3 hardcoded questions (removed in TASK-06).
- No styling work beyond existing components.

**Acceptance criteria**

- [ ] Manually with the stub: create sample → Generate question 1 → answer, "Strong evidence" label, one evidence card linking to the KB document version; the no-evidence sample question shows "Insufficient evidence" and no cards
- [ ] A failed generation shows the error code and Retry
- [ ] `grep -rn "confidence\|verified\|%" frontend/src/features/rfp` finds no UI text (ANS-07)
- [ ] `pnpm --filter frontend build` passes; a `deriveQuestionState`-label helper test if any logic lives in the frontend

**Dependencies**

TASK-04.

**Complexity**

M

**→ Demo milestone 1 (walking skeleton) after this task.**

---

### Milestone 3 — Multi-question RFP processing

### TASK-06 — RFP intake and deterministic question extraction

**Goal**

The employee pastes text or uploads a PDF/Markdown/text file, reviews the extracted questions, edits them and confirms.

**Why**

Real RFPs arrive as documents. Deterministic extraction is cheap, testable and can't invent questions; the confirm step catches what it misses.

**Implementation**

- `server/src/services/rfp-extract.ts`: pure `extractQuestions(text) → {text, section}[]` per EXT-02.
- `POST /api/rfps`: also accept `{title, text}` (JSON) and multipart `{title, file}`. Files: `inspectFile` (with `.txt`, see TASK-10 — accept `.pdf`/`.md` first if TASK-10 isn't merged) + `extract()` in a child process → page/section text joined → `source_text`. RFP created in `draft` (or `extraction_failed` with a short error).
- `PUT /api/rfps/:id/questions` (draft only), `POST /api/rfps/:id/confirm` (≥ 1 question), `POST /api/rfps/:id/extract` (re-run).
- UI: `RfpNewView.jsx` (title, paste box, file input with 3 MB check) and a draft mode in the workspace: editable list (text, section, add, delete, up/down), **Confirm questions**. Remove the TASK-05 sample button.
- Fixture: `server/fixtures/rfp/vendor-security-questionnaire.md` (≈ 15 questions, sections, numbered + bulleted + multi-line).

**Acceptance criteria**

- [ ] `extractQuestions` tests: numbered, lettered, bulleted, `?`-terminated, multi-line continuation, sections, duplicates dropped, > 50 → `TOO_MANY_QUESTIONS`
- [ ] EXT-04: every extracted question of the fixture is a substring of the normalised source
- [ ] Upload of a PNG renamed `.pdf` → 400; an image-only PDF → `extraction_failed` with the existing OCR message
- [ ] Editing questions after confirm → 409; confirm with zero questions → 409; B editing A's draft → 403
- [ ] New `server/test/rfp-extract.test.ts`; `rfp-api.test.ts` extended

**Dependencies**

TASK-03 (UI part: TASK-05).

**Complexity**

M

---

### TASK-07 — Background processing in the worker, with progress

**Goal**

**Generate all** queues every question; the worker drafts them one by one; failures stay isolated and are retryable; the UI shows progress live.

**Why**

A 30-question RFP can't run in one HTTP request (V3-D4). Per-question processing gives isolation (SC3-4) and idempotency (PROC-02).

**Implementation**

- `POST /api/rfps/:id/generate[?force=1]`: one `UPDATE … SET status='queued' WHERE rfp_id=:id AND status IN ('pending','failed'[, 'done'])`; confirmed RFPs only; creator only.
- `server/src/worker.ts`: after `claimVersion()` returns nothing, `claimQuestion()` (REQ_V3 §7.1 step 2, `FOR UPDATE SKIP LOCKED`), then `answerQuestion()` from TASK-04. Add `failStaleQuestions()` (step 6) next to `failStaleProcessing()`.
- Budget reached → `failed` / `budget_reached` (PROC-03).
- `GET /api/rfps/:id` progress counts; frontend polls every 3 s while any question is `queued`/`processing`; **Generate all** button with progress text; per-question **Retry**.
- `pnpm worker --once` drains RFP questions too (tests use `runWorker({ once: true })`).

**Acceptance criteria**

- [ ] PROC-01: 3 questions, stub fails #2 → 1 and 3 `done`, 2 `failed`; Retry on 2 → `done`; 1 and 3 have still exactly one answer each
- [ ] PROC-02: two concurrent workers never process the same question; calling Generate all twice queues nothing new; a stale `processing` question (> 2 min) is re-queued, and after 3 attempts becomes `failed`/`stale`
- [ ] KB versions are claimed before questions
- [ ] Manually: confirm the fixture RFP → Generate all → chips move queued → processing → draft without reload
- [ ] `server/test/worker.test.ts` and `rfp-answer.test.ts` extended

**Dependencies**

TASK-04, TASK-06 (UI); server part needs only TASK-04.

**Complexity**

L

**→ Demo milestone 2 (whole RFP drafted) after this task.**

---

### Milestone 4 — Review and feedback

### TASK-08 — Review and feedback API

**Goal**

Accept, edit, needs work and wrong evidence are enforced by the server and stored as an append-only log.

**Why**

Review is the human gate that makes answers trustworthy, and the stored decisions are the evaluation data (REQ_V3 §12).

**Implementation**

- `server/src/services/rfp-review.service.ts`:
  - `PATCH /api/rfp-answers/:id {editedText}` — REV-01; reuse the marker check from `review.ts`/edit route (`[n]` must be a citation of this answer).
  - `POST /api/rfp-answers/:id/reviews {verdict, note?, flaggedCitations?}` — REV-02 rules; computes `source_stale` with the §7.6 query adapted to `rfp_answer_sources`.
  - Each write: `SELECT … FOR UPDATE` on the question row first (serialises with regenerate's save), latest-answer check, creator check before 409s.
- `GET /api/rfps/:id`: add `sourceStale` flag per latest answer and the review history per question.
- SQL derivation of review state for the list/progress (`RFP_STATE_SQL`), with a shared fixture test against `deriveQuestionState` (RFP-WF-01).

**Acceptance criteria**

- [ ] Edit with `[7]` when 2 citations → 400; `answer_text` unchanged after edit
- [ ] Accept stores `final_text` = edited text; accept with empty text → 409; review on a non-latest answer → 409 `NOT_LATEST`; review while `processing` → 409
- [ ] `wrong_evidence` without citations or with an unknown citation → 400
- [ ] Accept → needs work → accept keeps 3 rows; state follows the latest
- [ ] Archiving a cited document makes `sourceStale: true`; an accept then stores `source_stale = true`
- [ ] SQL and TS state derivations agree on every row; B reviewing A's answer → 403
- [ ] New `server/test/rfp-review.test.ts`

**Dependencies**

TASK-04.

**Complexity**

M

---

### TASK-09 — Review UI

**Goal**

The employee works through the RFP question by question with Accept / Edit / Needs work / Wrong evidence and sees where they are.

**Why**

Delivers the full user workflow from REQ_V3 §1.

**Implementation**

- `RfpWorkspaceView.jsx`: action bar; Edit mode reusing the Ask edit pattern (`ConversationPanel.jsx` edit textarea); **Wrong evidence** dialog (checkbox per citation + note, `components/ui/Dialog`); **Needs work** with optional note; "Source updated" badge; review history list under the answer; filter chips by review state; next-question shortcut after a decision.
- Read-only mode for other employees' RFPs (no write buttons), as the History read-only view.
- RFP list shows progress (generated / accepted / failed) and Mine / All.

**Acceptance criteria**

- [ ] Manually with the stub: accept as-is, edit then accept, needs work with note, wrong evidence on citation [1] — each persists across reload and updates the chips and progress
- [ ] Other employee's RFP opens without write actions
- [ ] Regenerating an accepted question shows the new draft as `draft` and the old review in history
- [ ] `pnpm --filter frontend build` passes

**Dependencies**

TASK-05, TASK-08.

**Complexity**

M

**→ Demo milestone 3 (full workflow) after this task.**

---

### Milestone 5 — Knowledge quality, reliability and observability

### TASK-10 — Knowledge ingestion for RFPs: `.txt`, batching fix, fixtures

**Goal**

Company knowledge can be uploaded as PDF, Markdown or plain text, large files index safely, and the demo KB can answer a security questionnaire.

**Why**

The seeded KB is SubPilot product docs; an RFP demo needs security/compliance content. B05 can silently store the wrong vectors for larger PDFs, which would corrupt retrieval quality and every evaluation built on it.

**Implementation**

- `server/src/upload.ts` `inspectFile`: `.txt` → `text/plain`, same rules as Markdown; `extract/run.ts`: `.txt` → one section, no heading; `UploadDialog.jsx` accept list.
- **B05** (BUGS.md): batch `embedDocuments` in `worker.ts:processVersion` (batch size from the provider limit for `EMBEDDING_MODEL`, e.g. 100), one `paidAttempt` per batch; replace `?? vectors[0]` with a hard length check → `failed`. Tick B05.
- `server/fixtures/kb/`: `security-overview.md` (encryption at rest/in transit, key management), `data-retention-and-deletion.md`, `access-control.md` (SSO, MFA, least privilege), `business-continuity.txt` (RPO/RTO), `subprocessors.md`; categories Security / Compliance / Company. Deliberately **silent** on certifications (SOC 2, ISO 27001) so the golden set has unanswerable questions. Seeded by `server/src/seed.ts`.
- Category options in the KB UI include Company and Compliance.

**Acceptance criteria**

- [ ] `.txt` upload with invalid UTF-8 → 400; valid `.txt` → `ready` with chunks
- [ ] B05 checks: stub returning fewer vectors than chunks → version `failed`, no chunks; a document with more chunks than the batch size → several `embed_document` rows, each chunk its own vector
- [ ] `pnpm seed && pnpm worker --once` → all new fixtures `ready`
- [ ] `upload.test.ts`, `extract.test.ts`, `worker.test.ts` extended

**Dependencies**

TASK-01 (categories). Independent of TASK-02–09.

**Complexity**

M

---

### TASK-11 — Per-RFP processing view (observability)

**Goal**

For any RFP, see each question's status, attempts, retrieval counts, LLM latency, tokens, cost and failures.

**Why**

When an answer is bad or missing, the first question is "what happened in the pipeline?" — retrieval found nothing, the model timed out, or the output was invalid.

**Implementation**

- `GET /api/rfps/:id/processing` (OBS-01): one query joining `rfp_questions`, counts from `rfp_answer_sources` (retrieved / cited) for the latest answer, and `provider_calls` by `rfp_question_id`; totals and p95 latency computed in SQL (`percentile_cont`).
- Worker log line per processed question (OBS-02) — allow-listed fields only.
- Collapsible **Processing** panel in the workspace (OBS-03): a plain table.

**Acceptance criteria**

- [ ] After a 3-question run with one stub failure, the endpoint reports per-question attempts, error code, retrieved/cited counts and one row per provider call with latency
- [ ] Captured worker logs contain the ids and counts but none of the question strings (SEC-11 style test)
- [ ] `server/test/rfp-processing.test.ts`

**Dependencies**

TASK-07.

**Complexity**

S

---

### TASK-12 — Hybrid retrieval for RFPs *(optional)*

**Goal**

Exact tokens in RFP questions ("AES-256", "SOC 2", "RPO") are retrieved reliably.

**Why**

RFP questions are dense with acronyms and standard names, where vector search is weakest (REQ_V2 §7.7). Do it only if TASK-13's baseline shows misses on those cases.

**Implementation**

- Execute TASKS **T40** as written (`search_tsv` + GIN, lexical list, `rrf()`, `RETRIEVAL_MODE`). `rfp-answer.service.ts` needs no change beyond recording `retrieval_mode` from config.
- Run `pnpm eval:rfp` in both modes; paste both reports into this task.

**Acceptance criteria**

- [ ] T40 acceptance criteria pass
- [ ] RFP eval: hybrid hit rate ≥ vector hit rate and SC3-3 still holds; default mode decided on those numbers and recorded in REQ_V3 §7.2

**Dependencies**

TASK-13.

**Complexity**

M

---

### Milestone 6 — Evaluation and demo readiness

### TASK-13 — RFP golden set, `pnpm eval:rfp` and feedback report

**Goal**

Measure retrieval hit rate, evidence-status accuracy and safety on a fixed question set, and summarise stored review feedback.

**Why**

Without numbers, prompt and retrieval changes are guesses. Feedback is only useful if someone reads it.

**Implementation**

- `server/eval/rfp-golden.json` per RFP-EVAL-01 (12–15 cases against TASK-10 fixtures + existing KB).
- `server/eval/rfp-run.ts`: reuse `liveEvalGuard`, `budgetGuard`, seeding into `jarvis_eval` from `run.ts`; create one RFP via the service, `runWorker({ once: true })`, score: hit rate (any expected document in `rfp_answer_sources`), status accuracy + confusion matrix, server downgrades (`model_evidence_status ≠ evidence_status`), removed citations, forbidden patterns, failures, cost, p95 (from `provider_calls`). Pure scoring in `server/eval/rfp-score.ts`.
- `server/scripts/rfp-feedback.ts` (`pnpm rfp:feedback`) per RFP-EVAL-03 — SQL only.
- Root scripts `eval:rfp`, `rfp:feedback`.

**Acceptance criteria**

- [ ] `rfp-score.ts` unit tests (stub data): hit/miss, confusion matrix, forbidden-pattern match
- [ ] `pnpm eval:rfp` refuses `LLM_PROVIDER=stub`, prints the estimate first
- [ ] `LLM_PROVIDER=gemini pnpm eval:rfp` report pasted here; SC3-1, SC3-2, SC3-3 met (or the gap recorded with a follow-up)
- [ ] `pnpm rfp:feedback` on a DB with the TASK-09 manual reviews prints counts per verdict and accepted-after-edit

**Dependencies**

TASK-07, TASK-08, TASK-10.

**Complexity**

M

---

### TASK-14 — Export accepted answers

**Goal**

Download the RFP as Markdown or CSV with accepted answers and their sources.

**Why**

The output of RFP work is a document to paste into the issuer's form. Exporting only accepted text enforces the review gate.

**Implementation**

- `GET /api/rfps/:id/export?format=md|csv` (REV-05): `stripMarkers` from `normalise.ts`; sources line from `rfp_answer_sources` snapshot fields; "Not answered" for anything not accepted; `Content-Disposition: attachment`, `nosniff`. CSV built by hand (quote and double embedded quotes) — no new dependency.
- **Export** button in the workspace.

**Acceptance criteria**

- [ ] Export contains accepted `final_text` without `[n]` markers, in question order; an unreviewed draft never appears
- [ ] CSV with commas, quotes and newlines in answers round-trips through a standard parser in the test
- [ ] Readable by any employee; unauthenticated → 401
- [ ] `server/test/rfp-export.test.ts`

**Dependencies**

TASK-08.

**Complexity**

S

---

### TASK-15 — LLM question extraction fallback *(optional)*

**Goal**

Messy RFP files (tables flattened from PDF, prose questions) still yield a usable question list.

**Why**

EXT-02 handles numbered and `?` questions. Only add an LLM step if real samples show it missing > 20% (OPT3-2).

**Implementation**

- `rfp_extract` call kind (migration: `CALL_KINDS` CHECK) via `generateStructured` with `{questions:[{text, section}]}`; source chunked to the prompt budget.
- **Enforce EXT-04 in code:** drop any item that isn't a substring of the normalised source; report the count dropped.
- "Extract with AI" button in draft mode; result still goes through the confirm step.

**Acceptance criteria**

- [ ] Stub test: a returned question not present in the source is dropped and counted
- [ ] Budget reservation and `provider_calls` row per call, no text stored
- [ ] Deterministic extraction stays the default

**Dependencies**

TASK-06, TASK-02.

**Complexity**

M

---

### TASK-16 — Demo readiness

**Goal**

`docker compose up` plus one seed command gives a demo that walks the whole workflow, with a written script.

**Why**

The demo is the deliverable; it should not depend on tribal knowledge.

**Implementation**

- Check the Docker image includes `fixtures/rfp/` and the new KB fixtures; worker container processes RFP questions.
- `README.md` / `HANDOFF.md`: RFP section — run steps, demo script (upload `.txt` knowledge → create RFP from the fixture → confirm → Generate all → review four ways → open Processing → export), known limits.
- Release check: `pnpm test` green; logs from a full RFP run contain no question text; REQ_V3 MVP items checked off.

**Acceptance criteria**

- [ ] `docker compose up --build -d && docker compose exec api pnpm seed` → demo script works in the browser at `localhost:8080` with the stub, and with Gemini when a key is set
- [ ] `docker compose logs api worker | grep -c "<a fixture question>"` returns 0
- [ ] `pnpm test` passes

**Dependencies**

TASK-09, TASK-11, TASK-13, TASK-14.

**Complexity**

S

---

## 5. Future work (not V3)

Answer library from accepted answers (OPT3-3) · reranking (OPT3-5) · stale-source accept block with LCK-01 locking (OPT3-4) · LLM-judge support check on RFP answers (TASKS M11 / OPT3-6) · DOCX/XLSX questionnaires · tenants via `workspace_id` · streaming · collaborative editing · RBAC / SSO · analytics dashboards.

---

## 6. Recommended execution order

Give tasks to a coding agent in exactly this order:

1. **TASK-01** — Spec approval and V3 schema
2. **TASK-02** — Structured LLM call and RFP answer contract
3. **TASK-03** — RFP create / read API
4. **TASK-04** — `answerQuestion` pipeline and synchronous regenerate
5. **TASK-05** — Minimal RFP workspace UI → **Demo 1: walking skeleton**
6. **TASK-10** — Knowledge ingestion: `.txt`, B05, fixtures *(can start any time after TASK-01)*
7. **TASK-06** — RFP intake and deterministic extraction
8. **TASK-07** — Background processing in the worker → **Demo 2: whole RFP drafted**
9. **TASK-08** — Review and feedback API
10. **TASK-09** — Review UI → **Demo 3: full workflow**
11. **TASK-11** — Processing view
12. **TASK-14** — Export
13. **TASK-13** — Golden set, `eval:rfp`, feedback report
14. **TASK-16** — Demo readiness
15. **TASK-12** — Hybrid retrieval *(optional, only if TASK-13 shows exact-token misses)*
16. **TASK-15** — LLM extraction fallback *(optional, only if real RFPs defeat EXT-02)*

**First task:** TASK-01. Nothing else can merge without its migration, and it forces the V3-D1–D8 decisions to be made before code depends on them.

**First end-to-end demo milestone:** after TASK-05 — one hardcoded question → retrieval over the existing KB → structured Gemini/stub answer → validated citation → persisted answer + sources → evidence status and evidence card in the UI.

**Safe to run in parallel** (after TASK-01 is merged):
- TASK-02 ∥ TASK-03 (provider/prompt vs routes/services; no shared files except `app.ts` registration, trivial to rebase)
- TASK-10 ∥ anything in Milestones 2–4 (touches `upload.ts`, `extract/`, `worker.ts:processVersion`, fixtures, seed)
- TASK-06 server part (`rfp-extract.ts`, pure) ∥ TASK-04
- TASK-08 ∥ TASK-07 (review service vs worker claim) — both lock the question row; agree on "`FOR UPDATE` on `rfp_questions` first" from REQ_V3 and they stay compatible
- TASK-11 ∥ TASK-14 ∥ TASK-13 scoring code

**Do NOT parallelise:**
- Anything that adds a migration with anything else that adds one (TASK-01, TASK-12, TASK-15): the Drizzle journal conflicts. Keep migrations sequential.
- TASK-04 with TASK-07: the worker calls `answerQuestion`, whose locking and status transitions are defined in TASK-04. Finish TASK-04 first.
- TASK-05, TASK-06 (UI), TASK-09: all edit `RfpWorkspaceView.jsx`. Sequential.
- TASK-07 with TASK-10's B05 fix: both edit `worker.ts`. Either order, not at the same time.
- Any V3 task with the M10 refactor (T30–T37): it moves `generate.ts`, `normalise.ts`, `retrieve.ts`, `worker.ts`, which V3 imports. Do M10 before or after V3, not during (V3-D7).

**Skip if time is limited** (in this order of least loss): TASK-15, TASK-12, TASK-11's UI panel (keep the endpoint), TASK-14's CSV format (keep Markdown), TASK-13's feedback script (keep the golden eval). Do not skip TASK-08 — without stored feedback there is nothing to evaluate later.
