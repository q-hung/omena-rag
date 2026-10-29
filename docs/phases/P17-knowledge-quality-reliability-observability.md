# P17 · Knowledge quality, reliability, observability (V3 M5)

Status: TASK-10, TASK-11 done; TASK-12 optional, not started
Depends on: P13 (TASK-10 any time); P15 for TASK-11
Requirements: REQ_V3 §10; V3-D2, D3, D8
Recheck when changed (downstream): P18

## Amendments received
_none_

Tasks: TASK-10…12


### [x] TASK-10 — Knowledge ingestion for RFPs: `.txt`, batching fix, fixtures

**Goal**

Company knowledge can be uploaded as PDF, Markdown or plain text, large files index safely, and the demo KB can answer a security questionnaire.

**Why**

The seeded KB is SubPilot product docs; an RFP demo needs security/compliance content. B05 can silently store the wrong vectors for larger PDFs, which would corrupt retrieval quality and every evaluation built on it.

**Implementation**

- `server/src/upload.ts` `inspectFile`: `.txt` → `text/plain`, same rules as Markdown; `extract/run.ts`: `.txt` → one section, no heading; `UploadDialog.jsx` accept list.
- **B05** (BUGS.md): **done** — `ingest/indexing.ts` batches `embedDocuments` at 100, one `paidAttempt` per batch; length mismatch → `failed`.
- `server/fixtures/kb/`: `security-overview.md` (encryption at rest/in transit, key management), `data-retention-and-deletion.md`, `access-control.md` (SSO, MFA, least privilege), `business-continuity.txt` (RPO/RTO), `subprocessors.md`; categories Security / Compliance / Company. Deliberately **silent** on certifications (SOC 2, ISO 27001) so the golden set has unanswerable questions. Seeded by `server/src/seed.ts`.
- Category options in the KB UI include Company and Compliance.

**Acceptance criteria**

- [x] `.txt` upload with invalid UTF-8 → 400; valid `.txt` → `ready` with chunks
- [x] B05 checks: stub returning fewer vectors than chunks → version `failed`, no chunks; a document with more chunks than the batch size → several `embed_document` rows, each chunk its own vector
- [x] `pnpm seed && pnpm worker --once` → all new fixtures `ready`
- [x] `upload.test.ts`, `extract.test.ts`, `worker.test.ts` extended

**Dependencies**

TASK-01 (categories). Independent of TASK-02–09.

**Complexity**

M

---

### [x] TASK-11 — Per-RFP processing view (observability)

**Goal**

For any RFP, see each question's status, attempts, retrieval counts, LLM latency, tokens, cost and failures.

**Why**

When an answer is bad or missing, the first question is "what happened in the pipeline?" — retrieval found nothing, the model timed out, or the output was invalid.

**Implementation**

- `GET /api/rfps/:id/processing` (OBS-01): one query joining `rfp_questions`, counts from `rfp_answer_sources` (retrieved / cited) for the latest answer, and `provider_calls` by `rfp_question_id`; totals and p95 latency computed in SQL (`percentile_cont`).
- Worker log line per processed question (OBS-02) — allow-listed fields only.
- Collapsible **Processing** panel in the workspace (OBS-03): a plain table.

**Acceptance criteria**

- [x] After a 3-question run with one stub failure, the endpoint reports per-question attempts, error code, retrieved/cited counts and one row per provider call with latency
- [x] Captured worker logs contain the ids and counts but none of the question strings (SEC-11 style test)
- [x] `server/test/rfp-processing.test.ts`

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
