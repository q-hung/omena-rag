# P20 · Compiled TypeScript instead of Node strip-only mode

Status: not started (proposed, scope not yet approved)
Depends on: P10 (layering), P11 (eval entrypoints). Independent of P13–P19; can run any time, but not in parallel with a phase that adds new entrypoint scripts.
Requirements: none in REQ_V2/REQ_V3. Operational change.
Recheck when changed (downstream): P19 (new files must follow the build layout)

## Amendments received
_none_

Tasks: TASK-22…23.

## Why

The server runs `.ts` directly with Node's strip-only mode (`node src/api.ts`). Types are erased, not compiled, so:
- Syntax that needs a transform is banned: enums, namespaces, constructor parameter properties, top-level `return` (see HANDOFF "Node 26 strip-only mode").
- The runtime is the compiler, so Node's version decides what parses. Node 22 vs 26 already caused one alignment fix (Node 26 everywhere, `.nvmrc`).
- Prod ships and runs TypeScript sources, so there is no build artifact to test or roll back to.
- `tsc --noEmit` is a check only; nothing proves the emitted JS runs.

Goal: `tsc` emits JS to `server/dist`, prod runs that, and the Node version no longer decides which TS syntax is allowed.

## Open decision (resolve before TASK-22)

Dev workflow. Options:
- **A (recommended):** `tsc --watch` plus `node --watch dist/api.js`. Dev runs what prod runs; no new dependency.
- **B:** keep `node src/api.ts` for dev only. Faster edit loop, but dev and prod then differ again, which is the problem this phase removes.
- **C:** add `tsx`. A new dependency for what A already does.

## Tasks

### TASK-22 — Emit JS and run it in Docker
- **Goal:** prod runs compiled JS; no `.ts` at runtime.
- **Implementation:** `server/tsconfig.json`: `noEmit` off, `outDir: dist`, `rootDir: .`, `rewriteRelativeImportExtensions: true` (keeps `./x.ts` imports valid in source, rewrites to `.js` on emit); drop `allowImportingTsExtensions` if the compiler no longer needs it. Separate `tsconfig.build.json` excluding `test` if tests should not ship. Scripts: `build` emits, a new `typecheck` keeps `tsc --noEmit`; `start`, `worker`, `db:migrate`, `seed`, `eval*` point at `dist/`. Migrations folder and `golden.json`/fixtures must resolve from `dist` (copy or reference by path; check `db/migrate.ts` and `eval/`). Dockerfile: build stage runs the server build; final stage copies `server/dist` and installs prod deps only; `CMD` and `docker-compose.yml` `command` use `dist/*.js`. Update `check:layers` and Biome ignores for `dist`.
- **Acceptance:**
  - [ ] `pnpm build` emits `server/dist`; `dist` is git-ignored
  - [ ] Docker image contains no `server/src/*.ts` and runs `api` and `worker` from `dist`
  - [ ] `docker compose up` seeds and answers an Ask question end to end (same as P00–P09 delivery check)
  - [ ] Migrations and eval fixtures resolve when run from `dist`
  - [ ] `pnpm test`, `pnpm lint`, `pnpm check:layers` green; no behavior change

### TASK-23 — Dev workflow, restrictions lifted, docs
- **Goal:** one documented way to develop, and the strip-only rules gone.
- **Implementation:** apply the dev option chosen above to `server` `dev` script and root `pnpm dev`. Remove the strip-only rules from HANDOFF and README ("native TypeScript, strip-only"). Do not rewrite existing code to use enums or parameter properties; only the ban is lifted. Revisit whether Node must stay at 26 (`.nvmrc`, `engines`, Dockerfile) once Node no longer parses TS; keep the single pin either way.
- **Acceptance:**
  - [ ] `pnpm dev` rebuilds and restarts the API on a source edit
  - [ ] README and HANDOFF no longer mention strip-only; run commands are accurate
  - [ ] A constructor parameter property compiles and runs from `dist` (temporary check, not committed)
