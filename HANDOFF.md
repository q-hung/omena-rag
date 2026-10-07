# Jarvis handoff

Internal Product Support Copilot. Source of truth: `REQ_V2.MD`, `TASKS_V2.md`.

## Done (T00–T37, T40, T41)

Phases 0–9 (MVP) and M10 (server layering). Employees can sign in, generate
answers, reply to clarifications, edit and copy, save a reviewed internal
answer, and browse History. `pnpm eval` measures the golden set on Gemini.
`docker compose up` runs the full demo.

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)` |
| Budget | `server/src/llm/budget.ts` — `reserve`, `reconcile`, `paidAttempt` |
| Layers | `routes/` → `services/` → `db/`; `plugins/`; `rag/`, `ingest/`, `config/` |
| Retrieval | `server/src/rag/retrieve.ts` — SQL access filter; stub uses token overlap; `RETRIEVAL_MODE=hybrid` adds full-text + RRF (`rrf()`, default `vector`) |
| Prompt / normalise | `server/src/rag/prompt.ts`, `server/src/rag/normalise.ts` |
| Generation | `POST /api/conversations`, `POST /api/conversations/:id/regenerate` |
| Replies | `POST /api/conversations/:id/replies` `{selections?, text?}` |
| Edit | `PATCH /api/answers/:id` `{editedText}` |
| Review | `POST /api/conversations/:id/review` `{answerId, reviewAcknowledged}` |
| History | `GET /api/conversations?accountId&state&mine&signal&topic` |
| Eval | `server/eval/run.ts`, `server/eval/golden.json` — `pnpm eval` |
| Docker | `Dockerfile`, `docker-compose.yml` (`db`, `api`, `worker`), `STATIC_DIR` SPA |
| Ask UI | `frontend/src/hooks/useAsk.js` |
| History UI | `frontend/src/hooks/useHistory.js` |
| KB UI | `frontend/src/hooks/useDocuments.js` |
| Layer check | `pnpm check:layers` — routes must not import `db/` or `drizzle-orm` |

## Run

Local (Vite on :5173):

```bash
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

After seed + worker: 6 documents Ready (SSO guide warned about page 2) and Failed payment retries Failed (`No page has a text layer. OCR isn't supported.`). `refund-policy-v3.md` is in `server/fixtures/kb/` but is not seeded (eval applies it before E13).

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
- Golden set is now E01–E20. Baseline: hit rate 100% in both modes, so no gain; **default stays `vector`**, hybrid is opt-in. Numbers in TASKS T41. Revisit when the RFP golden set shows exact-token misses. Eval worktrees need the repo-root `.env` copied in (gitignored).

## Next

**M10 done (T30–T37).** Next is post-MVP M11 (T38+) or REQ_V3 work — not both in parallel with unfinished layering. Routes stay thin; `pnpm check:layers` enforces it.

## Limits

- S6 (replace Refund policy with v3) is a manual stub walkthrough; v3 is not seeded.
- Smoke-embed and `pnpm eval` against Gemini are manual; CI never calls Gemini.
- GEN-04 is tested with a shortened deadline (400 ms), not a 90 s hang.
- Node 26 strip-only mode: no constructor parameter properties; no top-level `return` in `.ts` scripts. The Docker image uses Node 22; the same TypeScript sources run there.
- Live E04 often answers both payments instead of `choose_record`; E09 often answers instead of `insufficient_evidence`. Golden-set targets still hold.
