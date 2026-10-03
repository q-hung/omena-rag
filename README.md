# Jarvis

Internal Product Support Copilot for Omena (fictional SaaS). Employees pick a
customer account, ask a question about the SubPilot product, and get an answer
grounded in two sources:

- **Account facts** from PostgreSQL, cited as `[F#]`
- **Knowledge-base passages** retrieved with pgvector, cited as `[1]`, `[2]`, …

Employees inspect the evidence, then edit, copy and save the answer as a
reviewed internal answer. Nothing is sent to customers. All demo data is
synthetic.

| Doc | Purpose |
|---|---|
| [REQ_V2.MD](REQ_V2.MD) | Product requirements (source of truth) |
| [TASKS.md](TASKS.md) | Implementation tasks and progress |
| [HANDOFF.md](HANDOFF.md) | Current state and next task |
| [docs/DESIGN.md](docs/DESIGN.md) | Design notes |
| [CLAUDE.md](CLAUDE.md) | Repository working rules |

## Stack

- **server/**: Node 26 (native TypeScript, strip-only), Fastify, Drizzle ORM,
  PostgreSQL 16 + pgvector, Zod, Vitest
- **frontend/**: React 18, Vite, Tailwind 4, React Router (plain JS)
- **LLM**: Google Gemini (`gemini-2.5-flash-lite`, `gemini-embedding-2`), or a
  deterministic stub
- pnpm workspace

## Quick start

Prerequisites: Node 26, pnpm, Docker.

```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm db:migrate
pnpm seed
pnpm worker --once
pnpm dev
```

`docker compose up -d db` starts Postgres on port 5433 and creates the
`jarvis` and `jarvis_test` databases. `pnpm worker --once` indexes the seeded
knowledge base. `pnpm dev` starts the API on :8080 and the UI on :5173.

Open **http://localhost:5173**. Requests from any other origin are rejected
(`APP_ORIGIN`).

Sign in as `ada@omena.example` or `rei@omena.example` with the password from
`SEED_EMPLOYEE_PASSWORD` in `.env`.

Keep `pnpm worker` running if you upload documents. It indexes queued versions
in the background.

`pnpm seed -- --date=YYYY-MM-DD` reseeds relative to a fixed date.

## Stub vs live mode

| `LLM_PROVIDER` | Behaviour |
|---|---|
| `stub` (default) | Deterministic hash embeddings and scripted answers. Retrieval ranks chunks by keyword overlap. The UI is labelled **SIMULATED AI**. No API key or cost. |
| `gemini` | Real embeddings and generation. Requires `GEMINI_API_KEY`. Retrieval uses cosine similarity with `RETRIEVAL_MIN_SCORE`. |

To check Gemini connectivity, run `pnpm --filter server smoke-embed`. It
prints the embedding dimension.

### Cost controls

- Every provider call reserves budget first and is recorded in
  `provider_calls`.
- `DAILY_BUDGET_USD` caps total spend per UTC day.
- Each employee gets 50 generation requests per UTC day.
- Prices per million tokens are set in `.env`.

## Configuration

See [.env.example](.env.example). The full schema is in
[server/src/config.ts](server/src/config.ts).

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://jarvis:jarvis@localhost:5433/jarvis` | |
| `TEST_DATABASE_URL` | `…/jarvis_test` | Tests truncate this database |
| `LLM_PROVIDER` | `stub` | `stub` or `gemini` |
| `GEMINI_API_KEY` | none | Required for `gemini` |
| `RETRIEVAL_MIN_SCORE` | `0.5` | Live mode only |
| `DAILY_BUDGET_USD` | `5` | |
| `APP_ORIGIN` | `http://localhost:5173` | Origin check (CSRF) |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `SESSION_HOURS` | `12` | |

## How an answer is generated

1. **T1 (short transaction):** lock the conversation row, check the quota,
   take a generation lock with an ownership token, and insert the question
   turn.
2. **Outside any transaction:** build the account fact snapshot, embed the
   query, and retrieve passages. Retrieval only uses active, non-archived
   document versions, and that filter is applied in SQL.
3. **Prompt:** build it from instructions, facts, passages (trimmed to a
   6k-token budget; facts are never dropped) and the question, which is
   wrapped as untrusted text.
4. **Generate:** retry with backoff, within a 90-second request deadline.
5. **Normalise:** resolve citations, remove invalid ones, and downgrade
   uncited answers to `insufficient_evidence`. Clarifications are capped at
   2 rounds.
6. **T2 (short transaction):** verify the lock token, save the answer and its
   sources, and release the lock. If a lock was taken over, its owner can't
   save.

The code is in [server/src/generate.ts](server/src/generate.ts),
[retrieve.ts](server/src/retrieve.ts), [prompt.ts](server/src/prompt.ts) and
[normalise.ts](server/src/normalise.ts).

## Layout

```
server/
  src/            API (Fastify), generation, retrieval, worker, db schema
  src/llm/        Provider (Gemini + stub), budget, retry
  drizzle/        SQL migrations
  fixtures/kb/    Seed knowledge-base documents (md + pdf)
  scripts/        seed, smoke-embed
  test/           Vitest (integration tests against jarvis_test)
frontend/
  src/features/   login, workspace (Ask), kb, history
  src/hooks/      useAsk, useDocuments, useSession, …
docker/           Postgres init (pgvector, test database)
```

## Development

```bash
pnpm test
pnpm build
pnpm --filter server test generate
```

`pnpm test` runs all tests and needs the `db` container running.
`pnpm build` runs the server typecheck (`tsc --noEmit`) and the frontend
build. Pass a test file name to run one server test file, as in the last
command.

Notes:

- Vitest does not typecheck. Run `pnpm build` before committing.
- Server test files share one database and run serially.
- Node runs `.ts` files directly in strip-only mode. That rules out enums,
  constructor parameter properties and top-level `return` in scripts.

## Status

Phases 0–6 are done: auth, account facts, knowledge base upload and indexing,
cost controls, retrieval and generation.

Next is Phase 7: clarification replies, edit, copy, save reviewed answer, and
History on the API. History currently reads prototype data. After that come
evaluation (`pnpm eval`, not yet implemented) and Docker delivery. See
[TASKS.md](TASKS.md).
