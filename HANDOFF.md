# Jarvis handoff

Internal Product Support Copilot. Source of truth: `REQ_V2.MD`, `TASKS.md`.

## Done (T00–T11)

Phases 0–4. Employees can sign in and see live account facts. The provider and budget modules exist but nothing in the Ask flow calls them yet.

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)` |
| Budget | `server/src/llm/budget.ts` — `reserve`, `reconcile`, `paidAttempt`, `sweepAbandonedReservations` |
| Stub scripts | `server/fixtures/scripts.ts` |

## Run

```bash
pnpm db:migrate && pnpm seed
pnpm dev          # API :8080, UI http://localhost:5173
```

Login: `ada@omena.example` or `rei@omena.example` / `jarvis-demo` (from `SEED_EMPLOYEE_PASSWORD`). Open **5173** only — `APP_ORIGIN` rejects other ports.

```bash
pnpm --filter server test
pnpm --filter server test provider
pnpm --filter server test budget
pnpm --filter server smoke-embed          # stub: prints 768
LLM_PROVIDER=gemini pnpm --filter server smoke-embed   # needs GEMINI_API_KEY
```

## Provider and budget

- `LLM_PROVIDER=stub|gemini`. Tests force stub (`server/test/env.ts`).
- Formats live only in `formatDocumentForEmbedding` / `formatQueryForEmbedding`.
- Gemini generate: JSON §7.4, `maxOutputTokens` 2048, `thinkingBudget: 0`, 20 s; embedQuery 10 s. ≤ 2 retries. No attempt after `deadline`.
- Each paid attempt: `paidAttempt` upserts `budget_days` then inserts `provider_calls` (`reserved`). Reconcile sets tokens/`cost_usd` from usage, or leaves the estimate on timeout. No prompt or response text is stored.
- 50 first-attempt `generate` rows per employee per UTC day → 429 `GENERATION_QUOTA`. Over daily cap → 429 `budget_reached`.
- `sweepAbandonedReservations()` marks `reserved` rows older than 10 minutes as `error`/`abandoned` and does not touch `budget_days`. Call it from the worker loop (T15).
- T21 should call `paidAttempt` once per attempt. `createProvider().generate` still retries internally and must not be wrapped as a single reservation.

## Next

**T12** — document upload and replace API.

Then T13–T18 (extract / chunk / worker / KB UI), T19–T22 (retrieve / prompt / conversations / Ask), T23–T26 (review + History), T27–T29 (eval / Docker / release).

## Limits

- Ask / History / KB UI still read `frontend/src/data/jarvis.js`.
- Worker does not run the abandoned-reservation sweep yet (T15).
- Conversations do not call the provider or reserve budget (T21).
- Smoke-embed against Gemini is manual; CI never calls Gemini.
- Node 26 strip-only mode: no constructor parameter properties.
