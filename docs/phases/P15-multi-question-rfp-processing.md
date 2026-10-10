# P15 · Multi-question RFP processing (V3 M3)

Status: done (TASK-07 manual browser check pending)
Depends on: P14
Requirements: REQ_V3 §6, §7.1
Recheck when changed (downstream): P16, P17 (worker claim, status transitions)

## Amendments received
_none_

Tasks: TASK-06, 07


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

- [x] `extractQuestions` tests: numbered, lettered, bulleted, `?`-terminated, multi-line continuation, sections, duplicates dropped, > 50 → `TOO_MANY_QUESTIONS`
- [x] EXT-04: every extracted question of the fixture is a substring of the normalised source
- [x] Upload of a PNG renamed `.pdf` → 400; an image-only PDF → `extraction_failed` with the existing OCR message
- [x] Editing questions after confirm → 409; confirm with zero questions → 409; B editing A's draft → 403
- [x] New `server/test/rfp-extract.test.ts`; `rfp-api.test.ts` extended

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

- [x] PROC-01: 3 questions, stub fails #2 → 1 and 3 `done`, 2 `failed`; Retry on 2 → `done`; 1 and 3 have still exactly one answer each
- [x] PROC-02: two concurrent workers never process the same question; calling Generate all twice queues nothing new; a stale `processing` question (> 2 min) is re-queued, and after 3 attempts becomes `failed`/`stale`
- [x] KB versions are claimed before questions
- [ ] Manually: confirm the fixture RFP → Generate all → chips move queued → processing → draft without reload
- [x] `server/test/worker.test.ts` and `rfp-answer.test.ts` extended

**Dependencies**

TASK-04, TASK-06 (UI); server part needs only TASK-04.

**Complexity**

L

**→ Demo milestone 2 (whole RFP drafted) after this task.**

---
