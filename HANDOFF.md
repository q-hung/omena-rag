# Jarvis handoff

Internal Product Support Copilot. Source of truth: `REQ_V2.MD`, `TASKS.md`.

## Done (T00–T26)

Phases 0–7. Employees can sign in, generate answers, reply to clarifications,
edit and copy, save a reviewed internal answer, and browse History on the API.
The prototype data files are gone.

| Area | Where |
|---|---|
| Auth | `POST /api/auth/login`, cookie `jarvis_session` |
| Accounts | `GET /api/accounts`, `GET /api/accounts/:id/facts` |
| Provider | `server/src/llm/` — `createProvider(config)` |
| Budget | `server/src/llm/budget.ts` — `reserve`, `reconcile`, `paidAttempt` |
| Retrieval | `server/src/retrieve.ts` — SQL access filter; stub uses token overlap |
| Prompt / normalise | `server/src/prompt.ts`, `server/src/normalise.ts` |
| Generation | `POST /api/conversations`, `POST /api/conversations/:id/regenerate` |
| Replies | `POST /api/conversations/:id/replies` `{selections?, text?}` |
| Edit | `PATCH /api/answers/:id` `{editedText}` |
| Review | `POST /api/conversations/:id/review` `{answerId, reviewAcknowledged}` |
| History | `GET /api/conversations?accountId&state&mine&signal&topic` |
| Ask UI | `frontend/src/hooks/useAsk.js` |
| History UI | `frontend/src/hooks/useHistory.js` |
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
pnpm --filter server test clarify edit review history-state conversations-list generate
```

After seed + worker: 6 documents Ready (SSO guide warned about page 2) and Failed payment retries Failed (`No page has a text layer. OCR isn't supported.`). `refund-policy-v3.md` is in `server/fixtures/kb/` but is not seeded.

## Review flow

- Reply is a new turn in T1 under the conversation lock. Allowed only when the latest outcome is `clarification_required`. Selections must be `choose_record` options, at most one per clarification.
- Retrieval query is turn 1 + latest reply text + selected fact values (so a selections-only reply still retrieves and matches the stub).
- Edit stores `edited_text` under `FOR UPDATE`; `answer_text` never changes. Unknown `[n]` / `[F#]` → 400.
- Copy strips markers. If `navigator.clipboard` is missing, the text is selected and the UI says "Press ⌘C / Ctrl+C to copy".
- Save takes `FOR UPDATE` on the conversation, then `FOR SHARE` on cited documents ordered by id, then the §7.6 stale check, then inserts `reviewed_answers`. The snapshot includes `category` so saved topic badges survive a delete.
- History state is derived in SQL (`STATE_SQL`, WF-05). Mine / All defaults to Mine. Other employees' conversations open read-only at `/history/:id`.

## Next

**T27** — golden set and `pnpm eval` (M8). Do not start until M7 is accepted.

Then T28–T29 (Docker / release).

## Limits

- S6 (replace Refund policy with v3) is a manual stub walkthrough; v3 is not seeded.
- Smoke-embed against Gemini is manual; CI never calls Gemini.
- GEN-04 is tested with a shortened deadline (400 ms), not a 90 s hang.
- Node 26 strip-only mode: no constructor parameter properties; no top-level `return` in `.ts` scripts.
