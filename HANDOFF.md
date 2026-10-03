# Jarvis handoff

Internal Product Support Copilot. Source of truth: `REQ_V2.MD`, `TASKS.md`.

## Done (T00–T10)

Phases 0–3 plus the provider module. Employees can sign in and see live account facts and signal badges. Generation, retrieval, budget, KB upload and History still use the prototype.

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)` |
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
pnpm --filter server smoke-embed          # stub: prints 768
LLM_PROVIDER=gemini pnpm --filter server smoke-embed   # needs GEMINI_API_KEY
```

## Provider notes (T10 / DEC-5)

- `LLM_PROVIDER=stub|gemini`. Tests force stub (`server/test/env.ts`).
- Formats live only in `formatDocumentForEmbedding` / `formatQueryForEmbedding`. Embedding-2 does not take `taskType`.
- Gemini generate: JSON §7.4 schema, `maxOutputTokens` 2048, `thinkingBudget: 0`, 20 s timeout; embedQuery 10 s. ≤ 2 retries on 429/5xx/timeout. No attempt starts after `deadline`.
- Stub embeddings are deterministic 768-d unit vectors. Unscripted questions return the labelled `insufficient_evidence` fallback.

## Next

**T11** — budget reservation, reconciliation, 50-generate quota, abandoned-reservation sweep.

Then T12–T18 (KB), T19–T22 (retrieve / prompt / conversations / Ask), T23–T26 (review + History), T27–T29 (eval / Docker / release).

## Limits

- Ask / History / KB UI still read `frontend/src/data/jarvis.js`.
- Provider does not reserve budget (T11) or persist `provider_calls`.
- Smoke-embed against Gemini is manual; CI never calls Gemini.
- Node 26 strip-only mode: no constructor parameter properties.
