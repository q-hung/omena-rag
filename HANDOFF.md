# Jarvis handoff

Internal Product Support Copilot. Status: `docs/TIMELINE.md`. Requirements: `REQ_V2.MD`, `REQ_V3.MD`.

## Where things are

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)`; `generate` (Ask) and `generateStructured<T>({prompt, schema, jsonSchema, kind, stubKind?}, deadline)` (any zod shape) |
| RFP prompt / schema | `server/src/rag/rfp-prompt.ts` (`buildRfpPrompt`, `RFP_PROMPT_VERSION='rfp-v2'`), `server/src/llm/rfp-schema.ts` (REQ_V3 §7.4) |
| Budget | `server/src/llm/budget.ts` — `reserve`, `reconcile`, `paidAttempt` |
| RFP review | `services/rfp-review.service.ts` (`editRfpAnswer`, `reviewRfpAnswer`, `staleAnswerIds`); each write locks the question row first. UI: `frontend/src/features/rfp/RfpReviewPanel.jsx` (Accept / Edit / Needs work / Wrong evidence dialog, history, `Source updated` badge); the workspace has filter chips by review state and a Next question button; non-creators get no write buttons; the list has Mine / All and progress |
| RFP worker | `services/rfp-queue.service.ts` (`queueQuestions`, `claimQuestion`, `failStaleQuestions`, `processQuestion`); `runWorker` in `ingest/indexing.ts` claims KB versions first, then questions; `pnpm worker --once` drains both. Tests: `runWorker({ once: true, rfp: { provider } })` |
| Dates / money | `server/src/lib/format.ts`: all UTC, Luxon behind one validated `utc()` (throws on invalid input). Money is integer minor units, formatted by `fmtMoney`. The frontend keeps its own native-`Date` copy in `frontend/src/lib/format.js` (no Luxon in the bundle); keep both outputs identical |
| Layers | `routes/` → `services/` → `db/`; `plugins/`; `rag/`, `ingest/`, `config/` |
| Retrieval | `server/src/rag/retrieve.ts` — SQL access filter; stub uses token overlap; `RETRIEVAL_MODE=hybrid` adds full-text + RRF (`rrf()`, default `vector`) |
| Prompt / normalise | `server/src/rag/prompt.ts`, `server/src/rag/normalise.ts` |
| Generation | `POST /api/conversations`, `POST /api/conversations/:id/regenerate` |
| Replies | `POST /api/conversations/:id/replies` `{selections?, text?}` |
| Edit | `PATCH /api/answers/:id` `{editedText}` |
| Review | `POST /api/conversations/:id/review` `{answerId, reviewAcknowledged}` |
| History | `GET /api/conversations?accountId&state&mine&signal&topic` |
| RFPs | `POST /api/rfps`: JSON `{title, questions:[…]}` (1–50) → `confirmed` + `pending`; JSON `{title, text}` or multipart `{title, file}` (`.pdf`/`.md`, 3 MB) → `extractQuestions` (`services/rfp-extract.ts`) → `draft` (PDF failure → `extraction_failed` + `extractionError`); `PUT /api/rfps/:id/questions {questions}` (draft only, creator only, else 409/403); `POST /api/rfps/:id/confirm` (≥ 1 question, else 409); `POST /api/rfps/:id/extract {text?}` re-run (draft / extraction_failed); `GET /api/rfps?mine=1` (default mine); `GET /api/rfps/:id` with `ownedByMe`, `reviewState` (REQ_V3 §4.4 `deriveQuestionState`); `POST /api/rfps/:id/generate[?force=1]` (creator only, confirmed only) queues `pending`+`failed` (+`done` with force) → worker; `GET /api/rfps/:id` returns `progress` counts; `PATCH /api/rfp-answers/:id {editedText}` (REV-01; every `[n]` must be a citation of the answer, else 400 `UNKNOWN_CITATION`); `POST /api/rfp-answers/:id/reviews {verdict, note?, flaggedCitations?}` (REV-02; appends a row; 403 non-creator, 409 `NOT_LATEST` / `GENERATION_IN_PROGRESS` / `EMPTY_TEXT`, 400 bad `wrong_evidence`); both return the RFP. `GET /api/rfps/:id` adds per question `reviewHistory` (all answers' reviews) and per latest answer `sourceStale`; `GET /api/rfps` adds `progress {total, generated, accepted, failed}` from `RFP_STATE_SQL` (`services/rfp-state.ts`, tested against `deriveQuestionState`); `POST /api/rfp-questions/:id/regenerate` (creator only, confirmed only, synchronous, also the per-question Retry) → `answerQuestion` |
| Eval | `server/eval/run.ts`, `server/eval/golden.json` — `pnpm eval` |
| RFP eval (P18 TASK-13) | `server/eval/rfp-golden.json` (R01–R13), `eval/rfp-score.ts` (pure scoring, SC3-1..3), `eval/rfp-run.ts` — `LLM_PROVIDER=gemini pnpm eval:rfp` (refuses stub, prints the estimate, seeds `jarvis_eval`, one RFP through the real worker, report + confusion matrix + every answer). `pnpm rfp:feedback` (`services/rfp-feedback.service.ts`, SQL only): latest review per answer, accepted as-is vs after edit, wrong-evidence citations by document, acceptance by evidence status. Tests: `server/test/rfp-eval.test.ts` |
| Docker | `Dockerfile`, `docker-compose.yml` (`db`, `api`, `worker`), `STATIC_DIR` SPA |
| RFP UI | `frontend/src/features/rfp/` — `RfpNewView` (`/rfps/new`), `RfpDraftView` (draft mode of `/rfps/:id`), `RfpWorkspaceView` (confirmed), `RfpProcessingPanel` (collapsible table under the workspace, OBS-03) |
| RFP export (P18 TASK-14) | `GET /api/rfps/:id/export?format=md\|csv` (default md; any signed-in employee): accepted answers only (latest answer's latest review is `accepted`), `[n]` markers stripped, sources line from the stored snapshot (only citations still in the final text), others "Not answered"; attachment + `nosniff`; CSV cells starting `= + - @` are apostrophe-prefixed. UI: Export .md / .csv buttons in the workspace header. Test: `server/test/rfp-export.test.ts` (`csv-parse` devDependency) |
| RFP processing (P17 TASK-11) | `GET /api/rfps/:id/processing` (`services/rfp-processing.service.ts`, any signed-in employee, like `GET /api/rfps/:id`): totals (calls, failures, tokens, cost, p95 latency via `percentile_cont`) and per question status, attempts, `errorCode`, retrieved/cited counts of the latest answer, and every `provider_calls` row (embed + generate, all attempts). The worker logs one JSON line per question (`rfpId, questionId, status, attempt, retrievedCount, evidenceStatus, latencyMs, errorCode`; no text); `RfpAnswerDeps.workerLog` overrides the stdout sink in tests. Test: `server/test/rfp-processing.test.ts` |
| Ask UI | `frontend/src/hooks/useAsk.js` |
| History UI | `frontend/src/hooks/useHistory.js` |
| KB UI | `frontend/src/hooks/useDocuments.js` |
| Layer check | `pnpm check:layers` — routes must not import `db/` or `drizzle-orm` |

## Run

Local (Vite on :5173):

```bash
pnpm build        # server -> server/dist (db:migrate, seed, worker, eval* run dist; rebuild after server edits)
pnpm db:migrate && pnpm seed && pnpm worker --once
pnpm dev          # API :8080, UI http://localhost:5173
pnpm worker       # leave running to index uploads
LLM_PROVIDER=gemini pnpm eval   # seeds jarvis_eval, calls Gemini
```

Full demo (SPA on :8080):

```bash
docker compose up --build -d
docker compose exec api pnpm seed
# open http://localhost:8080
```

Login: `ada@omena.example` or `rei@omena.example` / `jarvis-demo` (from `SEED_EMPLOYEE_PASSWORD`). Local: open **5173** only — `APP_ORIGIN` rejects other ports. Compose sets `APP_ORIGIN=http://localhost:8080`.

```bash
pnpm test
pnpm --filter server test eval clarify edit review history-state conversations-list generate spa
```

After seed + worker: 11 documents Ready (SSO guide warned about page 2) and Failed payment retries Failed (`No page has a text layer. OCR isn't supported.`). `refund-policy-v3.md` is in `server/fixtures/kb/` but is not seeded (eval applies it before E13).

Live generation model: `gemini-3.1-flash-lite`. `RETRIEVAL_MIN_SCORE=0.5`.

## Review flow

- Reply is a new turn in T1 under the conversation lock. Allowed only when the latest outcome is `clarification_required`. Selections must be `choose_record` options, at most one per clarification.
- Retrieval query is turn 1 + latest reply text + selected fact values (so a selections-only reply still retrieves and matches the stub).
- Edit stores `edited_text` under `FOR UPDATE`; `answer_text` never changes. Unknown `[n]` / `[F#]` → 400.
- Copy strips markers. If `navigator.clipboard` is missing, the text is selected and the UI says "Press ⌘C / Ctrl+C to copy".
- Save takes `FOR UPDATE` on the conversation, then `FOR SHARE` on cited documents ordered by id, then the §7.6 stale check, then inserts `reviewed_answers`. The snapshot includes `category` so saved topic badges survive a delete.
- History state is derived in SQL (`STATE_SQL`, WF-05). Mine / All defaults to Mine. Other employees' conversations open read-only at `/history/:id`.

## M12 hybrid retrieval (T40, T41 done)

- `document_chunks.search_tsv` (generated, GIN) via `0004_hybrid_search.sql`; apply with `pnpm db:migrate`.
- Hybrid = vector top 20 (cosine ≥ `RETRIEVAL_MIN_SCORE`) + lexical top 20 (`websearch_to_tsquery`, `&`→`|`, `ts_rank_cd`), fused by RRF k=60, top 8. Lexical-only hits skip the score floor. `answer_sources.score` holds the fused score.
- Golden set is now E01–E20. Baseline: hit rate 100% in both modes, so no gain; **default stays `vector`**, hybrid is opt-in. Numbers in [P12 T41](docs/phases/P12-hybrid-rrf.md). Revisit when the RFP golden set shows exact-token misses. Eval worktrees need the repo-root `.env` copied in (gitignored).

## Limits

- S6 (replace Refund policy with v3) is a manual stub walkthrough; v3 is not seeded.
- Smoke-embed and `pnpm eval` against Gemini are manual; CI never calls Gemini.
- GEN-04 is tested with a shortened deadline (400 ms), not a 90 s hang.
- Node 26 strip-only mode: no constructor parameter properties; no top-level `return` in `.ts` scripts. The Docker image uses Node 26 (`.nvmrc` is the single pin); the image runs the compiled `server/dist` (P20 TASK-22: `tsc -p tsconfig.build.json`, source maps on, data files resolved via `SERVER_ROOT` in `src/lib/paths.ts`). `pnpm dev` still runs the sources until TASK-23.
- Live E04 often answers both payments instead of `choose_record`; E09 often answers instead of `insufficient_evidence`. Golden-set targets still hold.
- RFP intake (P15 TASK-06): `.txt` KB upload works (P17 TASK-10); RFP intake still takes only `.pdf`/`.md` files, paste covers text. A `.md` upload keeps its raw text (headings drive sections). An unindented continuation line must start lowercase, otherwise it is read as a new line. PDF blank-page warnings are not stored.
- RFP worker (P15 TASK-07): one question at a time per worker, no parallelism inside a worker. After `budget_reached` a worker stops claiming questions until the next UTC day (restart or **Generate all** re-queues the failed one; the others stay `queued`). A stale `processing` question (> 2 min) is re-queued up to 3 attempts, then `failed`/`stale`. UI polls every 3 s while anything is queued/processing. Manual check (milestone 2): confirm `server/fixtures/rfp/sample-rfp-acme.md` (11 answerable questions, 2 with no evidence; `vendor-security-questionnaire.md` is the extraction fixture), Generate all, watch chips move without reload; not yet done in a browser.
- RFP processing (P17 TASK-11): a failed question logs `retrievedCount: null` (the count isn't known once generation throws); the endpoint shows `0` because no answer was saved. The panel refetches when progress counts change; checked in a browser with the stub provider (happy path only; the failure row is covered by `rfp-processing.test.ts`).
- RFP eval (P18 TASK-13): live baseline 29 Oct 2026 met SC3-1..3 (hit 8/8, status 13/13, 0 unsafe, 0 forbidden); report in the P18 phase file. The set is small, so treat 100% as a floor. Forbidden patterns are substring matches on the answer text, so a refusal that quotes the pattern would count as a hit; the fixed INSUFFICIENT text does not.
- RFP export (P18 TASK-14): the buttons navigate to the endpoint, so an expired session shows the raw 401 JSON instead of the app's login redirect. Checked in a browser with the stub provider (both buttons download; the header clips at ~1024 px wide).
