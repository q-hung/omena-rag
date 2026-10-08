# RFP context (read before P13–P18)

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

**First task:** TASK-01 (done 6 Oct 2026; next is TASK-02). Nothing else can merge without its migration, and it forces the V3-D1–D8 decisions to be made before code depends on them.

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
