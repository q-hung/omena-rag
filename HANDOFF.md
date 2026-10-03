# Jarvis handoff

Internal Product Support Copilot. Source of truth: `REQ_V2.MD`, `TASKS.md`.

## Done (T00–T22)

Phases 0–6. Employees can sign in, see live account facts, manage the knowledge
base, and generate answers on the API. History, clarification replies, edit,
and save reviewed answers are still prototype / next milestone.

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)` |
| Budget | `server/src/llm/budget.ts` — `reserve`, `reconcile`, `paidAttempt` |
| Retrieval | `server/src/retrieve.ts` — SQL access filter; stub uses token overlap |
| Prompt / normalise | `server/src/prompt.ts`, `server/src/normalise.ts` |
| Generation | `POST /api/conversations`, `POST /api/conversations/:id/regenerate` |
| Ask UI | `frontend/src/hooks/useAsk.js` |
| KB UI | `frontend/src/hooks/useDocuments.js` |

## Run

```bash
pnpm db:migrate && pnpm seed && pnpm worker --once
pnpm dev          # API :8080, UI http://localhost:5173
pnpm worker       # leave running to index uploads
```

Login: `ada@omena.example` or `rei@omena.example` / `jarvis-demo` (from `SEED_EMPLOYEE_PASSWORD`). Open **5173** only — `APP_ORIGIN` rejects other ports.

```bash
pnpm --filter server test
pnpm --filter server test retrieval prompt normalise generate conversations-list
```

After seed + worker: 6 documents Ready (SSO guide warned about page 2) and Failed payment retries Failed (`No page has a text layer. OCR isn't supported.`). `refund-policy-v3.md` is in `server/fixtures/kb/` but is not seeded.

## Generation

- T1 locks the conversation, checks the 50/day quota, sets `generation_token`, inserts the turn. T2 verifies the token, inserts the answer, resolves `chunk_id` in-insert (GEN-05), clears the lock.
- Request deadline is 90 s from T1 (GEN-04). Each generate attempt is its own `paidAttempt`. Pass `once: true` so Gemini does not retry inside one reservation.
- `requireOwner` → 403 `NOT_OWNER` after 404 and before state checks.
- Snapshot failure after T1 → 503 `account_data_unavailable` with `conversationId`.
- Stub retrieval ranks eligible chunks by token overlap (stopwords dropped, light stemming). Hash embeddings do not reach `RETRIEVAL_MIN_SCORE` (0.5). Live Gemini still uses cosine + the configured threshold.
- Stub script markers `[F:key]` / `[S:doc:k]` are resolved in the normaliser via fact keys and `scriptKeyFor`.

## Next

**T23** — clarification replies (S2b).

Then T24–T26 (edit / copy / save / History), T27–T29 (eval / Docker / release).

## Limits

- History still reads `frontend/src/data/jarvis.js`.
- Reply, edit, and save reviewed answer are not on the API (T23–T25).
- Smoke-embed against Gemini is manual; CI never calls Gemini.
- GEN-04 is tested with a shortened deadline (400 ms), not a 90 s hang.
- Node 26 strip-only mode: no constructor parameter properties; no top-level `return` in `.ts` scripts.
