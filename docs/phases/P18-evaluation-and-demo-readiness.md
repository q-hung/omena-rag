# P18 · Evaluation and demo readiness (V3 M6)

Status: not started
Depends on: P16, P17
Requirements: REQ_V3 §12, §14
Recheck when changed (downstream): —

## Amendments received
_none_

Tasks: TASK-13…16


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
