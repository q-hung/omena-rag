# P14 · Walking skeleton: one question end to end (V3 M2)

Status: in progress (TASK-02–03 done)
Depends on: P13
Requirements: REQ_V3 §7, §8, §13
Recheck when changed (downstream): P15 (answerQuestion), P16 (review UI shares RfpWorkspaceView)

## Amendments received
_none_

Tasks: TASK-02…05


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

- [x] Existing `provider.test.ts` and `generate.test.ts` pass unchanged (Ask unaffected)
- [x] `generateStructured` with a malformed JSON response retries and then throws `INVALID_OUTPUT`; a truncated response throws; a 400 makes one attempt
- [x] `buildRfpPrompt` drops the lowest passage when over budget, marks the question as untrusted, contains no employee name/email (RFP-PRM-01)
- [x] New `server/test/rfp-prompt.test.ts`; provider tests extended

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

- [x] Create → 201 with questions in order; 51 questions → 400; unauthenticated → 401; foreign Origin → 403
- [x] Employee B can read A's RFP (`ownedByMe: false`); `mine=1` lists only own RFPs
- [x] `deriveQuestionState` unit tests cover every row of REQ_V3 §4.4
- [x] New `server/test/rfp-api.test.ts`

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
