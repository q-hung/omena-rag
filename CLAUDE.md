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

- `docs/TIMELINE.md` — phase order, status, next task, and the rule for
  changing an earlier phase. Start here.
- `docs/phases/Pnn-*.md` — tasks and acceptance checks for one phase.
- `REQ_V2.MD` (Ask / History / KB) and `REQ_V3.MD` (RFP) — requirements.
  Large: use `docs/REQ-INDEX.md` for line ranges and read only the section a
  task cites (`scripts/req-index.sh` regenerates it after edits).
- `BUGS.md` — open defects. `HANDOFF.md` — run commands and known limits.
- Old task lists and REQ history: git history only (`git show c1c8a33:TASKS_V2.md`).

Read TIMELINE, the relevant phase file and its `Depends on` phases before
changing code (for `Depends on` phases, only the parts your task touches). If your change touches an earlier phase, follow TIMELINE
"Changing an earlier phase". Report contradictions before implementing
affected behavior. Do not silently expand the MVP.

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
