# Repository instructions

## Project

Jarvis is an internal Product Support Copilot for Omena, a fictional
SaaS company. It answers employees' questions about the SubPilot
product by combining account facts from PostgreSQL with passages
from the knowledge base.

Employees select an account, ask a question, inspect the account
facts and document evidence, edit and copy the answer, and save it
as a reviewed internal answer. Nothing is sent to customers.

All demo data is synthetic. Live mode must use real retrieval
and model calls; simulated behavior must be clearly labeled.

## Source of truth

- REQ_V2.MD defines product requirements.
- TASKS_V2.md defines implementation tasks and progress.
- CLAUDE.md defines repository working instructions.

Read the relevant requirements and task before changing code.
Report contradictions before implementing affected behavior.
Do not silently expand the MVP.

## Server layers (M10)

`server/src/` is layered. Keep new code in the right place:

- `routes/*.routes.ts` — zod schemas and thin handlers only (validate, call a
  service, set status). Do not import `db/` or `drizzle-orm` here.
- `services/*.service.ts` — business logic and Drizzle queries.
- `plugins/` — cross-cutting hooks (`registerX(app, config)`).
- `rag/`, `ingest/`, `config/` — domain folders; entrypoints stay
  `api.ts`, `worker.ts`, `db/migrate.ts`.

`pnpm check:layers` fails if a route imports `db/` or `drizzle-orm`.

## Code style

Always use explicit `{}` on `if`, `else`, `for` and `while` bodies, with
`} else {` on one line. No single-line `if (x) return;`. `pnpm lint`
(Biome `useBlockStatements`) fails CI otherwise.
