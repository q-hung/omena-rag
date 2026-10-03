# Jarvis handoff

Internal Product Support Copilot. Source of truth: `REQ_V2.MD`, `TASKS.md`.

## Done (T00–T18)

Phases 0–5. Employees can sign in, see live account facts, and manage the
knowledge base on the API. Ask / History still use the prototype.

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)` |
| Budget | `server/src/llm/budget.ts` — `reserve`, `reconcile`, `paidAttempt`, `sweepAbandonedReservations` |
| Upload | `POST /api/documents`, `POST /api/documents/:id/versions` |
| Extract / chunk | `server/src/extract.ts` (child), `server/src/chunk.ts` |
| Worker | `pnpm worker` / `pnpm worker --once` |
| KB API | list, detail, archive, restore, retry, impact, file, `GET /api/documents/indexing-status` |
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
pnpm --filter server test upload extract chunk worker kb
```

After seed + worker: 6 documents Ready (SSO guide warned about page 2) and Failed payment retries Failed (`No page has a text layer. OCR isn't supported.`). `refund-policy-v3.md` is in `server/fixtures/kb/` but is not seeded.

## Knowledge base

- Multipart fields: `file`, `title`, `category`, `effectiveDate`, `note`. Limit 3 MiB (`FILE_TOO_LARGE`).
- Extractor child: 60 s, `--max-old-space-size=256`, empty `process.env`. `pdfjs-dist` 6 has no `isEvalSupported` flag; eval is off.
- Worker claims with `FOR UPDATE SKIP LOCKED`. One `embed_document` reservation per version. Activation locks the document row and promotes only a higher `version_number` (KB-05). Each loop sweeps abandoned reservations and stale `processing` rows (> 10 min).
- Budget reached while embedding → version `failed` with "Daily budget reached — retry later".
- UI polls `/api/documents/indexing-status` every 3 s while anything is queued or processing.

## Next

**T19** — retrieval (access filter in SQL).

Then T20–T22 (prompt / conversations / Ask), T23–T26 (review + History), T27–T29 (eval / Docker / release).

## Limits

- Ask / History still read `frontend/src/data/jarvis.js`.
- Conversations do not call the provider or reserve budget (T21).
- Smoke-embed against Gemini is manual; CI never calls Gemini.
- Node 26 strip-only mode: no constructor parameter properties; no top-level `return` in `.ts` scripts.
