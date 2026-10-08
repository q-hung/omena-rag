# P13 · Domain and persistence (V3 M1)

Status: done (TASK-01, PR #16, 6 Oct 2026; migrations 0001, 0002)
Depends on: P12
Requirements: REQ_V3 §2, §5
Recheck when changed (downstream): P14–P18 (every RFP table)

## Amendments received
_none_

Tasks: TASK-01


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

- [x] `pnpm db:migrate` applies on the current schema and is a no-op on a second run
- [x] Deleting an RFP cascades to questions, answers, sources and reviews; deleting a document sets `rfp_answer_sources.chunk_id` to null and keeps `document_id`/`version_id`
- [x] Duplicate (`rfp_id`, `seq`) is rejected; invalid `evidence_status`/`verdict`/`status` values are rejected
- [x] A document with category `Compliance` can be inserted
- [x] `server/test/schema.test.ts` extended with the cases above

**Dependencies**

None.

**Complexity**

M

**Result (6 Oct 2026):** `drizzle/0001_rfp.sql` — five RFP tables, `Company`/`Compliance`, `rfp_generate`, `provider_calls.rfp_question_id`. `drizzle/0002_rfp_constraints.sql` (review): REV-02 checks on `rfp_reviews.final_text`/`flagged_citations`, `rfp_answers.retrieval_mode` in (`vector`, `hybrid`), index on `provider_calls.rfp_question_id`. Additive because local DBs had already applied 0001. V3-D1–D8 approved. `schema.test.ts` 9/9.

---
