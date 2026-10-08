# P10 · Server layering refactor (M10)

Status: done (T30–T37)
Depends on: P09
Requirements: no requirement changes
Recheck when changed (downstream): every later phase (new code goes in routes/ → services/ → db/; `pnpm check:layers`)

## Amendments received
_none_

Structure only. No API, behaviour or UI change; every existing test passes unchanged except for import paths. Bugs found along the way are logged in `BUGS.md`, not fixed here (known: `GET /api/documents/:id` runs one chunk query per version; `presentConversation` runs one source query per answer).

**Two PRs, not one per task (4 Oct 2026).** The moves are renames plus import edits, checked mechanically by the T30 route snapshot and the existing suite, so per-task PRs add rebase and CI rounds without adding safety.
- **PR 1 — T30.** Merged and green on the *old* layout first; otherwise the snapshot proves nothing.
- **PR 2 — T31–T37.** One commit group per task, in task order. Within each task: a `git mv` commit first, then an edits commit, so `git blame` keeps the history and the PR can be reviewed commit by commit. The last commit of each task builds and passes `pnpm --filter server test` (a `git mv`-only commit can't, because imports break until the edits commit).
- PR 2 merges before any `TASKS_V3.md` branch starts (REQ_V3 V3-D7). Don't run M10 and V3 in parallel.

Target layers in `server/src/`:
- `routes/*.routes.ts`: zod schema + a thin handler (validate, call a service, set the status). No `db/` or `drizzle-orm` import.
- `services/*.service.ts`: logic and queries. Drizzle is the query layer, so there is no repository layer.
- `plugins/`: cross-cutting hooks, kept as plain `registerX(app, config)` functions (no `fastify-plugin`).
- Entrypoints keep their paths: `api.ts`, `worker.ts`, `db/migrate.ts`.

### [x] T30 · Safety net
- **Result (4 Oct 2026):** `kb.test.ts` covers `GET /api/documents/indexing-status` (`{ busy: true }` while queued; 401 anonymous) and `GET /api/documents/:id/impact` (zeros, 1/1 unsaved+saved, 404, 401). `routes.test.ts` snapshots `printRoutes({ commonPrefix: false })` on the old layout. `pnpm --filter server test` — 27 files / 149 tests.
- **Goal:** catch any route or response change before the files move.
- **Depends:** T29.
- **Acceptance:**
  - Tests for the two routes that have none: `GET /api/documents/indexing-status`, `GET /api/documents/:id/impact`.
  - A route inventory test that snapshots `app.printRoutes()`.
- **Verify:** `pnpm --filter server test` passes.

  Covered (4 Oct 2026). Snapshot is the T31–T37 check that the route tree did not change.

### [x] T31 · Plugins and shared helpers
- **Result (4 Oct 2026):** `plugins/security.ts`, `plugins/errors.ts`, `plugins/request-log.ts`; `rowsOf` in `db/rows.ts`; `app.ts` wires plugins + routes only. Route snapshot unchanged. 149 tests green.
- **Goal:** `app.ts` only wires plugins and routes.
- **Depends:** T30.
- **Acceptance:**
  - `plugins/security.ts` (helmet, SEC-03 origin check), `plugins/errors.ts` (error handler, 404 + SPA fallback), `plugins/request-log.ts` (SEC-11 line).
  - `rowsOf` moves from `upload.ts` to `db/`.
  - `app.ts` ≤ ~30 lines.
- **Verify:** `pnpm --filter server build && pnpm --filter server test`; the route snapshot is unchanged.

  Covered (4 Oct 2026).

### [x] T32 · Accounts (pilot)
- **Result (4 Oct 2026):** `services/account.service.ts` + `routes/accounts.routes.ts`; `accounts.ts` removed. Snapshot + suite green.
- **Goal:** set the routes → services pattern on the smallest module.
- **Depends:** T31.
- **Acceptance:** `services/account.service.ts` (`listAccounts`, `getAccountFacts`); `routes/accounts.routes.ts` calls them; `accounts.ts` is deleted.
- **Verify:** as T31.

  Covered (4 Oct 2026).

### [x] T33 · Auth
- **Result (4 Oct 2026):** `services/auth.service.ts`, `plugins/auth.ts`, `routes/auth.routes.ts`; tests import `SESSION_COOKIE` / `hashToken` from the service. Suite green.
- **Goal:** move session checks and login out of route code.
- **Depends:** T32.
- **Acceptance:**
  - `services/auth.service.ts`: `login` (rate limit, verify, create session), `logout`, `findSessionEmployee`, `getEmployee`.
  - `plugins/auth.ts`: the `onRequest` session hook, keeping the B03 matched-route check as it is.
  - `routes/auth.routes.ts`. Test imports of `SESSION_COOKIE` / `hashToken` are updated in the same PR (no re-export shim).
- **Verify:** as T31; `auth.test.ts` passes.

  Covered (4 Oct 2026).

### [x] T34 · Documents
- **Result (4 Oct 2026):** `services/document.service.ts`, `services/document-upload.service.ts`, `routes/documents.routes.ts` (`readMultipart` stays in routes). `kb` / `upload` tests green.
- **Goal:** take the SQL out of the KB routes.
- **Depends:** T33.
- **Acceptance:**
  - `services/document.service.ts`: `list`, `indexingBusy`, `get`, `remove`, `setArchived`, `retryVersion`, `impact`, `getVersionFile`.
  - `upload.ts` → `services/document-upload.service.ts`. `readMultipart` stays in `routes/documents.routes.ts` (HTTP only).
- **Verify:** as T31; `kb`, `upload` tests pass.

  Covered (4 Oct 2026).

### [x] T35 · Conversations
- **Result (4 Oct 2026):** `conversation-view.service.ts`, `conversation-list.service.ts`, `generate.service.ts`, `review.service.ts`, `routes/conversations.routes.ts` (7 handlers). Generate/review/edit/clarify/list/history-state green.
- **Goal:** take the SQL and presentation logic out of the conversation routes.
- **Depends:** T34.
- **Acceptance:**
  - Commit 1: `presentConversation`, `presentSummaries`, `presentAnswer`, `citeCard` → `services/conversation-view.service.ts`.
  - Commit 2: History filter query and `accountsWithSignal` → `services/conversation-list.service.ts`.
  - `routes/conversations.routes.ts` keeps the 7 handlers, `PATCH /api/answers/:id` included.
  - `generate.ts`, `review.ts` → `services/` (rename only).
- **Verify:** as T31; `generate`, `review`, `edit`, `clarify`, `conversations-list`, `history-state` tests pass.

  Covered (4 Oct 2026).

### [x] T36 · Domain folders
- **Result (4 Oct 2026):** `rag/`, `ingest/`, `config/`; `account-context.service.ts`, `state.service.ts`. Scripts/Docker/eval imports retargeted. Stub `pnpm eval` refuses; Docker `/ask` serves with CSP self. Snapshot + 149 tests green.
- **Goal:** group the remaining modules by job.
- **Depends:** T35.
- **Acceptance:**
  - `rag/`: `retrieve`, `prompt`, `normalise`, `chunk`. `ingest/`: worker logic, `extract*`. `config/`: `config`, `env`. `context.ts` → `services/account-context.service.ts`, `state.ts` → `services/`.
  - `package.json` scripts, `Dockerfile`, `docker/entrypoint.sh`, `eval/` and `scripts/` imports are updated if paths change.
- **Verify:** as T31; `pnpm eval` starts in stub mode up to its refusal; `docker compose up --build` serves `/ask`.

  Covered (4 Oct 2026).

### [x] T37 · Layer guardrail
- **Result (4 Oct 2026):** `pnpm check:layers` (`rg` over `server/src/routes/`) in CI; layer rules in `CLAUDE.md` / `AGENTS.md`. Bad `db` import fails; clean tree passes.
- **Goal:** stop SQL from creeping back into routes.
- **Depends:** T36.
- **Acceptance:**
  - A CI step fails if `server/src/routes/` imports `db/` or `drizzle-orm`.
  - The layer rules are added to `CLAUDE.md` and `AGENTS.md`.
- **Verify:** adding a `db` import to a route file fails CI locally (`grep` step); removing it passes.

  Covered (4 Oct 2026). M10 complete.
