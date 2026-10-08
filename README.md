# Jarvis

Internal Product Support Copilot for Omena (fictional SaaS). Employees pick a
customer account, ask a question about the SubPilot product, and get an answer
grounded in two sources:

- **Account facts** from PostgreSQL, cited as `[F#]`
- **Knowledge-base passages** retrieved with pgvector, cited as `[1]`, `[2]`, …

Employees inspect the evidence, then edit, copy and save the answer as a
reviewed internal answer. Nothing is sent to customers. All demo data is
synthetic. MVP is complete (M0–M9), and the server layering refactor (M10) is done.

| Doc | Purpose |
|---|---|
| [docs/TIMELINE.md](docs/TIMELINE.md) | Phases, status, tasks (start here) |
| [REQ_V2.MD](REQ_V2.MD), [REQ_V3.MD](REQ_V3.MD) | Product requirements (Ask / RFP) |
| [HANDOFF.md](HANDOFF.md) | Run commands and known limits |
| [BUGS.md](BUGS.md) | Post-MVP defects with cause, fix and check |
| [docs/DESIGN.md](docs/DESIGN.md) | Design notes |
| [CLAUDE.md](CLAUDE.md) | Repository working rules |

## Stack

- **server/**: Node 26 locally (native TypeScript, strip-only); Docker image is Node 22. Fastify, Drizzle ORM, PostgreSQL 16 + pgvector, Zod, Vitest
- **frontend/**: React 18, Vite, Tailwind 4, React Router (plain JS)
- **LLM**: Google Gemini (`gemini-3.1-flash-lite`, `gemini-embedding-2`), or a deterministic stub
- pnpm workspace; Docker Compose (`db`, `api`, `worker`)

## Demo

Prerequisites: Docker. Copy `.env` if you want live Gemini; stub mode needs none.

```bash
cp .env.example .env          # optional for stub
docker compose up --build -d
docker compose exec api pnpm seed
```

Open **http://localhost:8080**. Compose sets `APP_ORIGIN` to that origin. Migrations
run on API start; the worker indexes seeded documents in the background.

Sign in as `ada@omena.example` or `rei@omena.example` /
`jarvis-demo` (or `SEED_EMPLOYEE_PASSWORD` from `.env`).

## Local development

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

`db` is Postgres on port 5433 (`jarvis` and `jarvis_test`). `pnpm worker --once`
indexes the seed set. `pnpm dev` starts the API on :8080 and Vite on :5173.

Open **http://localhost:5173**. `.env` sets `APP_ORIGIN=http://localhost:5173`;
other origins are rejected.

Don't point Vite at the Docker `api` container. Compose sets its `APP_ORIGIN`
to `:8080`, so every sign-in or upload from `:5173` gets 403 `FORBIDDEN_ORIGIN`.
Run `docker compose stop api` before `pnpm dev`, or use http://localhost:8080.

Keep `pnpm worker` running if you upload documents. Sample files to upload are in
[docs/sample-uploads/](docs/sample-uploads/).

`pnpm seed -- --date=YYYY-MM-DD` reseeds relative to a fixed date.

## Stub vs live mode

| `LLM_PROVIDER` | Behaviour |
|---|---|
| `stub` (default) | Deterministic hash embeddings and scripted answers. Retrieval ranks chunks by keyword overlap. The UI is labelled **SIMULATED AI**. No API key or cost. |
| `gemini` | Real embeddings and generation. Requires `GEMINI_API_KEY`. Retrieval uses cosine similarity with `RETRIEVAL_MIN_SCORE`. |

`pnpm --filter server smoke-embed` checks Gemini connectivity and prints the
embedding dimension.

`LLM_PROVIDER=gemini pnpm eval` seeds `jarvis_eval` (D = 2026-10-02), indexes
with Gemini, and scores the golden set. It refuses stub mode and prints the
cost estimate first. CI never calls Gemini.

### Cost controls

- Every provider call reserves budget first and is recorded in `provider_calls`.
- `DAILY_BUDGET_USD` caps total spend per UTC day.
- Each employee gets 50 generation requests per UTC day.
- Prices per million tokens are set in `.env`.

## Configuration

See [.env.example](.env.example). The full schema is in
[server/src/config/config.ts](server/src/config/config.ts).

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://jarvis:jarvis@localhost:5433/jarvis` | Compose overrides to `db:5432` |
| `TEST_DATABASE_URL` | `…/jarvis_test` | Tests truncate this database |
| `LLM_PROVIDER` | `stub` | `stub` or `gemini` |
| `GEMINI_API_KEY` | none | Required for `gemini` |
| `GENERATION_MODEL` | `gemini-3.1-flash-lite` | |
| `JUDGE_MODEL` | `gemini-3-flash-preview` | `pnpm eval --judge` only; must differ from generation |
| `RETRIEVAL_MODE` | `vector` | `vector` or `hybrid` (vector + full-text, RRF). Live mode only; stub keeps token overlap |
| `RETRIEVAL_MIN_SCORE` | `0.5` | Live mode only |
| `DAILY_BUDGET_USD` | `5` | |
| `APP_ORIGIN` | `http://localhost:8080` | `.env.example` uses `:5173` for Vite |
| `COOKIE_SECURE` | `false` in `.env` / Compose | Set `true` behind HTTPS |
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

The code is in [server/src/services/generate.service.ts](server/src/services/generate.service.ts),
[rag/retrieve.ts](server/src/rag/retrieve.ts), [rag/prompt.ts](server/src/rag/prompt.ts) and
[rag/normalise.ts](server/src/rag/normalise.ts).

## Layout

```
server/
  src/            Entrypoints: api.ts, worker.ts, app.ts (wiring)
  src/routes/     Zod schemas and thin handlers; no db/ or drizzle-orm imports
  src/services/   Business logic and Drizzle queries (generate, review, documents, …)
  src/plugins/    Cross-cutting hooks: security, auth, request log, errors
  src/rag/        Chunking, retrieval, prompt, citation normalisation
  src/ingest/     Text extraction and the indexing loop the worker runs
  src/config/     Env loading and config schema
  src/db/         Schema, migrations runner, connection
  src/llm/        Provider (Gemini + stub), budget, retry
  drizzle/        SQL migrations
  eval/           golden set and `pnpm eval`
  fixtures/kb/    Seed knowledge-base documents (md + pdf)
  scripts/        seed, smoke-embed
  test/           Vitest (integration tests against jarvis_test)
frontend/
  src/features/   login, workspace (Ask), kb, history
  src/hooks/      useAsk, useDocuments, useSession, …
Dockerfile        api and worker image (SPA baked in)
docker/           Postgres init, api/worker entrypoint
```

## Development

```bash
pnpm test
pnpm build
pnpm check:layers
pnpm lint
pnpm --filter server test generate
LLM_PROVIDER=gemini pnpm eval
```

`pnpm test` runs all tests and needs the `db` container running.
`pnpm build` runs the server typecheck (`tsc --noEmit`) and the frontend
build. `pnpm check:layers` fails if a route imports `db/` or `drizzle-orm`
(see [CLAUDE.md](CLAUDE.md)). `pnpm lint` (Biome) requires `{}` on every
`if`/`else`/loop body. CI runs both. Pass a test file name to run one server test file, as in the last
command.

Notes:

- Vitest does not typecheck. Run `pnpm build` before committing.
- Server test files share one database and run serially.
- Node runs `.ts` files directly in strip-only mode. That rules out enums,
  constructor parameter properties and top-level `return` in scripts.
