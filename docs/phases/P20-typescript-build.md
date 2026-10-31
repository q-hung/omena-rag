# P20 · Compiled TypeScript instead of Node strip-only mode

Status: TASK-22 done, TASK-23 not started (approved 30 Oct 2026, prioritized ahead of P18 TASK-15/16 and P19)
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
- **A (recommended):** `tsc --watch` plus `node --watch dist/src/api.js`. Dev runs what prod runs; no new dependency.
- **B:** keep `node src/api.ts` for dev only. Faster edit loop, but dev and prod then differ again, which is the problem this phase removes.
- **C:** add `tsx`. A new dependency for what A already does.

## Build design (checked by a trial emit with TypeScript 7.0.2, 30 Oct 2026)

**Works as planned:** `tsc --rewriteRelativeImportExtensions` emits clean JS; static and dynamic `import('./x.ts')` both become `.js`. `tsc -v` is 7.0.2 (`typescript ^7.0.2`), so no compiler change is needed.

**Layout (decided):** keep `rootDir: .`. Output is `dist/src/*`, `dist/scripts/*`, `dist/eval/*`, `dist/fixtures/*`. Entry points are `dist/src/api.js`, `dist/src/worker.js`, `dist/src/db/migrate.js`. `tsc` copies nothing but JS, so `drizzle/*.sql`, `fixtures/kb/*`, and `eval/*.json` stay in `server/` and are read from there, not copied into `dist`.

**What breaks if only the emit changes (all found by reading `import.meta` use):**
| Where | Today | After emit | Fix |
|---|---|---|---|
| `src/ingest/extract.ts` | spawns `join(import.meta.dirname, 'extract-child.ts')` | the file is `extract-child.js`; the OCR/extract child fails to start | use `extract-child${extname(import.meta.filename)}` so src and dist both work |
| `src/config/env.ts` | `.env` at `../../../.env` | one directory deeper, wrong file | resolve from the server root |
| `src/db/migrate.ts` | `../../drizzle` | `dist/drizzle`, which does not exist | resolve from the server root |
| `src/seed.ts` | `../fixtures/kb` | `dist/fixtures/kb`, which has no `.md`/`.pdf` | resolve from the server root |
| `docker/entrypoint.sh`, `docker-compose.yml` | `node server/src/...ts` | no `.ts` in the image | `node server/dist/src/...js` |

One shared helper in `src/lib/` finds the server root (nearest `package.json` above `import.meta.dirname`), used by the three path cases. It works the same from `src` and `dist`, so tests (Vitest runs `src` directly) and prod agree. This is the only new abstraction in the phase.

**Source maps:** emit them and run prod with `--enable-source-maps`, so stack traces point at `.ts` lines. Needed for the CLAUDE.md rule that errors are investigable without local reproduction.

**Not changed:** `target: ES2023`, `module: NodeNext` (emits ESM because `type: module`), Vitest config.

## Tasks

### [x] TASK-22 — Emit JS and run it in Docker
- **Goal:** prod runs compiled JS; no `.ts` at runtime.
- **Implementation:** `server/tsconfig.json`: `noEmit` off, `outDir: dist`, `rootDir: .`, `rewriteRelativeImportExtensions: true` (keeps `./x.ts` imports valid in source, rewrites to `.js` on emit); drop `allowImportingTsExtensions` if the compiler no longer needs it. Separate `tsconfig.build.json` excluding `test` if tests should not ship. Scripts: `build` emits, a new `typecheck` keeps `tsc --noEmit`; `start`, `worker`, `db:migrate`, `seed`, `eval*` point at `dist/`. Apply the path fixes in "Build design" (child process, `.env`, migrations, seed, entrypoint, compose); add the server-root helper and a test that spawns the extract child from the emitted JS. Dockerfile: build stage runs the server build; final stage copies `server/dist` and installs prod deps only; `CMD` and `docker-compose.yml` `command` use `dist/*.js`. Update `check:layers` and Biome ignores for `dist`.
- **Acceptance:**
  - [x] `pnpm build` emits `server/dist`; `dist` is git-ignored
  - [x] Docker image contains no `server/src/*.ts` and runs `api` and `worker` from `dist`
  - [x] `docker compose up` seeds and answers an Ask question end to end (same as P00–P09 delivery check)
  - [x] Migrate, seed, and the PDF/text extract child all work when run from `dist` (not only from `src`)
  - [x] Stack traces from `dist` show `.ts` source lines
  - [x] `pnpm test`, `pnpm lint`, `pnpm check:layers` green; no behavior change
- **Result (31 Oct 2026):** dev workflow option A assumed (TASK-23 applies it). `tsconfig.json` stays the typecheck config (`pnpm typecheck`, includes tests); `tsconfig.build.json` emits `dist` without tests (build is about 1 s). More `import.meta` path users than the table listed (`eval/score.ts`, `judge.ts`, `rfp-score.ts`, `eval/run.ts`, `scripts/write-kb-pdfs.ts`); all now use `SERVER_ROOT`. The image copies only `drizzle`, `fixtures/kb` and `dist` (no `.ts`; `server/eval` is dockerignored). Checked: image has no `.ts`; api and worker run from `dist`; migrate, seed, worker and an Ask (login, then `answer_ready`) from `dist` on `omena_eval` with the stub; stack trace shows `config.ts:62`. `server/test/build.test.ts` emits to `node_modules/.cache` and runs the extract child from JS (fails if the child path regresses).

### TASK-23 — Dev workflow, restrictions lifted, docs
- **Goal:** one documented way to develop, and the strip-only rules gone.
- **Implementation:** apply the dev option chosen above to `server` `dev` script and root `pnpm dev`. Remove the strip-only rules from HANDOFF and README ("native TypeScript, strip-only"). Do not rewrite existing code to use enums or parameter properties; only the ban is lifted. Revisit whether Node must stay at 26 (`.nvmrc`, `engines`, Dockerfile) once Node no longer parses TS; keep the single pin either way.
- **Acceptance:**
  - [ ] `pnpm dev` rebuilds and restarts the API on a source edit
  - [ ] README and HANDOFF no longer mention strip-only; run commands are accurate
  - [ ] A constructor parameter property compiles and runs from `dist` (temporary check, not committed)
