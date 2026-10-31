# P19 · RAG quality tracing and production logging

Status: not started (proposed, scope not yet approved)
Depends on: P12 (retrieval modes), P15 (worker, RFP answers). Optional: P11 (judge) for TASK-20
Requirements: defined below (`OBS2-*`); extends REQ_V2 SEC-11 and REQ_V3 §10 (OBS-01). Not in REQ_V2/REQ_V3 yet.
Recheck when changed (downstream): P18 (eval and demo read traces)

## Amendments received
- 31 Oct 2026 ← P20 TASK-22: the server is compiled to `server/dist`; new entrypoints and scripts run from `dist` (`package.json` scripts point there), and data files must be resolved with `SERVER_ROOT` (`src/lib/paths.ts`), not `import.meta`-relative paths.

Tasks: TASK-17…21. Only TASK-17 adds a migration (it also carries `provider_calls.request_id`), so there is no journal conflict inside this phase. Any other phase that adds a migration must go before or after it, not in parallel.

## Why

Today a bad answer can't be explained after the fact. `answer_sources` keeps the retrieved chunks and one score, but not the lexical rank, the cut-off, per-stage latency or which request produced it. Logs carry `reqId` but `provider_calls` doesn't, so a log line can't be joined to a paid call. Nothing tells us in production whether retrieval quality is drifting; the golden set only runs on demand.

## Open decision (resolve before TASK-17)

SEC-11 forbids question text, answers, document text and account facts in logs. Tracing for quality needs to say *what was retrieved*, not *what was said*. Rule for this phase: **traces and logs hold ids, scores, ranks, counts, lengths and timings only.** Content stays where it already lives (`turns`, `answers`, `document_chunks`) and is joined by id. Raw-content debugging stays `LLM_DEBUG_DIR` (local only). If you want question text in traces, amend SEC-11 explicitly first; this phase does not.

## Requirements

- **OBS2-01** Every generation (Ask turn or RFP question attempt) writes one `retrieval_traces` row: mode, candidate chunk ids with vector score, lexical rank, fused score, which passed the cut-off, which were cited, stage timings (embed, search, generate), request id, model. No text.
- **OBS2-02** `provider_calls.request_id` links a log line, a trace and a paid call (worker calls use the job id).
- **OBS2-03** Log events use a fixed name and field allow-list; a test fails if a seeded question, answer or document string appears in captured logs or traces.
- **OBS2-04** Production health: liveness, readiness (DB reachable, migrations current, worker heartbeat fresh) and budget remaining.
- **OBS2-05** Quality signals are computed from stored data, per day and per mode: outcome mix, `insufficient_evidence` rate, zero-retrieval rate, removed-citation count, stale-source rate, edit rate (`edited_text` set), RFP reviewer verdicts.
- **OBS2-06** A flagged answer can be turned into a golden-set case skeleton, so production failures feed `pnpm eval`.

### TASK-17 — Retrieval trace table and writer (OBS2-01)
- **Goal:** explain any answer's retrieval after the fact.
- **Implementation:** migration `retrieval_traces` (`id`, `kind` ask|rfp, `answer_id` or `rfp_answer_id` FK `ON DELETE CASCADE`, `request_id`, `mode`, `model`, `candidates jsonb` of `{chunkId, vector, lexicalRank, fused, passed, cited}`, `timings jsonb`, `created_at`); indexes on the answer ids and `created_at`; also `provider_calls.request_id`. Writer in `services/`, called from `generate.service.ts` and the RFP answer service; `rag/retrieve.ts` returns the extra fields it already computes.
- **Acceptance:**
  - [ ] One trace row per Ask turn and per RFP attempt, including `insufficient_evidence` and zero-retrieval cases
  - [ ] Hybrid trace shows both ranks; vector trace has `lexicalRank` null
  - [ ] Deleting an answer deletes its trace; deleting a document leaves `chunkId` (no text) intact
  - [ ] Trace contains no question, answer or chunk text (test scans the JSON)
  - [ ] Ask and RFP behaviour and API responses unchanged (existing suite green)

### TASK-18 — Correlation ids and log hardening (OBS2-02, OBS2-03)
- **Goal:** one id joins logs, traces and paid calls; logs can't leak content.
- **Implementation:** write `request_id` on every `provider_calls` row. `request-log.ts` and the worker log a fixed event set (`generate.done`, `retrieve.done`, `worker.job`, `provider.call`) through an allow-list helper in `lib/`; `LOG_FORMAT=json|pretty`; error codes are logged, messages are not.
- **Acceptance:**
  - [ ] A full Ask flow and a full RFP flow: every `provider_calls` row has a `request_id` that appears in the logs and the trace
  - [ ] SEC-11 test extended: seeded question, reply, answer, document and account-fact strings absent from logs and traces
  - [ ] An unknown field passed to the log helper is dropped (test)

### TASK-19 — Quality signals (OBS2-05)
- **Goal:** see retrieval and answer quality drift without running the golden set.
- **Implementation:** `GET /api/quality?from&to&mode`, computed in SQL from `answers`, `retrieval_traces`, `reviewed_answers`, `rfp_reviews`. A small read-only table in the UI is optional. Rates only, no per-employee breakdown. No migration.
- **Acceptance:**
  - [ ] Seeded data gives the expected rates (stub, test)
  - [ ] An empty range returns zeros, not an error
  - [ ] No text fields in the response

### TASK-20 — Answer to eval case (OBS2-06)
- **Goal:** close the loop from a bad production answer to a regression test.
- **Implementation:** `pnpm eval:from-trace <answerId>` prints a `golden.json` case skeleton (account, question from `turns`, observed outcome, retrieved document ids) to stdout for a human to complete. It writes no file. Optional: sample N% of answers through the P11 judge, off by default.
- **Acceptance:**
  - [ ] Output validates against the golden-case schema once `expect` is filled in
  - [ ] An unknown id exits non-zero with a clear message

### TASK-21 — Health, retention and runbook (OBS2-04)
- **Goal:** operable in production.
- **Implementation:** `GET /api/health` (liveness) and `GET /api/ready` (DB, migration count, worker heartbeat updated each loop, budget remaining); retention for `retrieval_traces` (default 90 days, in the worker's sweeper); `docs/RUNBOOK.md`: what each log event means, alert thresholds (heartbeat older than 2 min, error-code rate, daily budget above 80%), how to trace one answer. The heartbeat needs a small table or row; if so, add it to TASK-17's migration.
- **Acceptance:**
  - [ ] `/api/ready` fails with the DB down and with a stale heartbeat (test)
  - [ ] Health routes need no session and expose nothing beyond per-check ok/failing
  - [ ] The sweeper deletes traces past retention and nothing newer
  - [ ] The runbook walks one answer from id to trace to logs

## Not in this phase
Third-party tracing stack (OpenTelemetry, Langfuse), dashboards, per-employee analytics, storing prompt or answer text. Add when a real deployment needs them.
