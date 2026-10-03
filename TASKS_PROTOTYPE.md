# Jarvis — Clickable Prototype Tasks

Source of truth: `REQ_V2.MD` v2.1 (cited as §n, requirement IDs as `AREA-NN`).
This file plans a **frontend-only clickable prototype** of the v2.1 product. It
does not replace `TASKS.md` (the production plan, still to be regenerated from
§17). Mark a task `[x]` only when every acceptance check passes.

---

## Goal and boundaries

**Goal:** an employee can click through scenarios S1–S6 (§13.1) end to end in
the browser, so the v2.1 UX (account facts vs document evidence, four
outcomes, clarification, save reviewed answer, source changes) can be judged
before any backend is built.

**How:** evolve the existing mock in `frontend/` in place. The real app reuses
these components (§12.3), so nothing is thrown away.

| In the prototype | Not in the prototype |
|---|---|
| All §12 screens: login, Ask (account, conversation, evidence), History, Knowledge base, Document page | Server, database, real auth, sessions |
| Scripted answers for S1–S6 and E01–E15 | Retrieval, embeddings, model calls |
| Client-side state rules from §4.2, §7.6, §8 (derived state, staleness, edit validation, save rules) | Cost controls, quotas, budget (§10) |
| KB replace/archive/restore/delete/retry with simulated indexing | File parsing; uploads use canned files |
| One prototype-only control: "Next generation fails" | Persistence: a reload resets the demo |

**Rules (CLAUDE.md: simulated behaviour must be labelled)**
- The banner reads **SIMULATED AI · PROTOTYPE** on every screen.
- Free-text questions that match no script return a labelled
  `insufficient_evidence` answer: "Simulated: no scripted answer for this
  question." The prototype never pretends to answer.
- Scripted answers follow the §7.4 contract: `[F#]` for facts, `[n]` for
  passages, no promises, no confidence percentages, no "verified".

**Stack decisions for the prototype**
- Keep npm and the existing Vite setup. The pnpm workspace move is production M0; doing it now adds churn with no prototype benefit.
- No React Router. Keep the existing `view` state switch (no new dependency).
- Keep the Google Fonts import. CSP (SEC-04) applies to the production server, not the prototype.
- Pure rule functions in `src/lib/model.js`, checked with Node's built-in
  `node --test` (no Vitest yet, no new dependency).
- Demo date pinned to **D = 2 Oct 2026**, as in the current mock and the eval (§5.2).

---

## Conventions

- Run: `npm --prefix frontend run dev` (`.claude/launch.json` → `frontend`, port 5173).
- Build: `npm --prefix frontend run build`.
- Rule tests: `node --test frontend/src/lib/model.test.js`.
- Each task leaves the app building and clickable.

---

## Phase A — Data and rules

### [x] P01 · Prototype data fixtures
- **Note:** written as a new `src/data/jarvis.js` (+ `src/lib/format.js`) so the old mock keeps building; `demo.js` is deleted with the old hook in P04.
- **Goal:** replace `src/data/demo.js` with v2.1 data shaped like the §5 and §17a tables, so swapping in the API later is mechanical.
- **Refs:** §5.1, §5.2, §5.4, §6.4, §17a.
- **Depends:** —
- **Acceptance:**
  - `accounts`: the five seed accounts A-1001 to A-1005 with plan, status, interval, region, features, payments, webhook endpoints and deliveries, with dates relative to D.
  - `factsFor(accountId)` returns the §5.4 snapshot: `F1…Fn` in fixed order (account, features, payments, webhooks), derived values precomputed (`days_since`, `consecutive_failures`, `last_success_at`, formatted amounts), and explicit `empty` sections.
  - `docs`: the §6.4 KB: Plan comparison, Refund policy v2 (exceptions clause, silent on add-ons) with a staged v3, Billing FAQ (3-day conflict), Payment methods and regions, SSO setup guide (PDF, 3 pages, warning for blank page 2, passages carry page numbers), Webhooks developer guide with Troubleshooting, Failed payment retries (failed: "No page has a text layer. OCR isn't supported.").
  - `scripts`: scripted results in the §7.4 response shape for E01–E15, keyed by account plus question id, each with `match` keywords. S2b has two steps (clarification, then the reply result). E13 is selected automatically when Refund policy v3 is active.
  - No person names in account data (§16 Remove). Employee: one seeded display name for the sidebar only.
- **Verify:** `node -e "import('./frontend/src/data/jarvis.js').then(m => console.log(m.factsFor(m.accountById(5)).empty))"` prints the empty webhook section for A-1005.

### [x] P02 · Rule functions and their check
- **Note:** `answerStale` and `reviewedChanged` became one `sourcesChanged(cites, docs)` plus `citeStatus` (badge text); `normalise` and `simulateAnswer` were added for §9.3. Old helpers stay until P12 because the old components still import them.
- **Goal:** the state rules the UI depends on, as pure functions.
- **Refs:** §4.2, §7.6, §9.3 (rules 1, 5, 6, 7), ANS-02, ANS-03, ANS-04.
- **Depends:** P01.
- **Acceptance:** `src/lib/model.js` exports and replaces the old helpers (`findP`, `outdatedOf`, `sourceLabels`, `STAGE_TEXT` are removed):
  - `deriveState(conversation, generating)` → one of the 8 §4.2 states.
  - `answerStale(answer, docs)` and `reviewedChanged(reviewed, docs)` → true when a cited version is superseded, or its document is archived or deleted.
  - `validateEdit(text, answer)` → error for an unknown `[n]` or `[F#]`.
  - `stripMarkers(text)` → text without `[n]`/`[F#]`.
  - `saveBlockers(conversation, answer, docs, acknowledged)` → the first failing ANS-04 rule as a hint string, or null.
  - `pickScript(accountId, text, docs, conversation)` → the scripted result, the "no script" fallback, or a clarification-round result. It applies §9.3 rule 7 (a third clarification becomes `insufficient_evidence`).
- **Verify:** `node --test frontend/src/lib/model.test.js` passes, with one test per function, including: archived source → stale; restore clears it; `[7]` rejected; copy text has no `[`; save blocked for `clarification_required`; save blocked without acknowledgement when review reasons exist.

### [x] P03 · State hook
- **Note:** `useSubPilot.js` is deleted in P04, when `App` switches to `useJarvis` (deleting it here would break the running mock).
- **Goal:** `src/hooks/useJarvis.js` replaces `useSubPilot.js` and holds all prototype state and simulated flows.
- **Refs:** §4.1, §4.2, WF-01–03, ANS-02–05, CLR-02, KB-03–08.
- **Depends:** P02.
- **Acceptance:**
  - State: `view`, `signedIn`, `selectedAccountId`, `conversations` (turns, answers, reviewed), `docs`, `failNext`, UI selections, `toast`.
  - Actions:
    - `ask(accountId, text)` creates a conversation and turn 1; `reply`; `regenerate`.
    - Each generation shows "Generating…" for ~1.2 s, then appends an answer from `pickScript`. With `failNext` on, it saves no answer and the state becomes `failed`.
    - `edit` stores `edited_text` (`answer_text` never changes); `save` runs `saveBlockers` first.
    - KB: `replace`, `archive`, `restore`, `delete` (returns the impact count first), `retry` (latest version only, KB-06).
    - Simulated indexing goes Queued → Processing → Ready, using badges only, with no sub-steps.
  - `useSubPilot.js` is deleted.
- **Verify:** `npm --prefix frontend run build` passes; `grep -r useSubPilot frontend/src` returns nothing.

## Phase B — Screens

### [x] P04 · Shell, login and navigation
- **Note:** Ask and History show placeholders until P05/P10. The document page's "Cited in" panel was removed here (it read the old state); `index.html` title is now "Jarvis — Prototype".
- **Goal:** the v2.1 app frame.
- **Refs:** §12.1, AUTH-01 (simulated), §16 Remove/Fix.
- **Depends:** P03.
- **Acceptance:**
  - Login screen with email and password fields. Any input signs in. It is labelled "Prototype — no real authentication".
  - Sidebar: **Ask**, **History**, **Knowledge base**; header "Jarvis"; signed-in employee at the bottom; Sign out returns to login.
  - Banner: **SIMULATED AI · PROTOTYPE**, plus the "Next generation fails" toggle.
  - Removed: Evaluations nav, speed setting, Load demo data, and the `App` props `simulateFailure` / `emptyLibrary` / `simSpeed`.
- **Verify:** in the browser: log in, open each of the three nav items, sign out.

### [x] P05 · Account panel
- **Goal:** account selection and the structured facts panel.
- **Refs:** §12.2 left pane, §5.4, CTX-04, PRM-01 note.
- **Depends:** P04.
- **Acceptance:**
  - `QuestionPanel.jsx` → `AccountPanel.jsx`: a selector listing company, ref, plan and status.
  - Facts grouped by section with their `F#`. Empty sections shown explicitly ("No webhook endpoints configured").
  - Note: "Company name and references are not sent to the model."
  - The selector is locked once a conversation has started (the account is fixed per conversation, §4.1); "New question" unlocks it.
  - A highlighted fact row when its `[F#]` chip is selected.
- **Verify:** select A-1004: WH-1 shows 12 consecutive failures and its last success time; select A-1005: the empty webhook section is visible.

### [x] P06 · Conversation and answer
- **Goal:** ask a question and read the answer.
- **Refs:** §12.2 centre pane, ANS-01, §9.1, §9.2, §9.3 banners, ANS-07, CLR-03.
- **Depends:** P05.
- **Acceptance:**
  - Question box with the free-text PII note, and suggested-question chips for the selected account (S1–S5, E-cases), so demo paths are one click.
  - Turn history (questions, clarification questions, replies).
  - `DraftText.jsx` renders `[F#]` chips (link to the fact row) and `[n]` buttons (link to the evidence card).
  - Outcome badge; gaps grouped by kind (`no_record` / `documentation` / `user_input`); banners for each review reason.
  - Failed state: "Generation failed — Retry", with no answer saved.
  - `out_of_scope`: short explanation; only "New question" is offered.
  - No "Generated with N% confidence", "Supported" or "verified" wording; the 3-step progress is removed.
- **Verify:** S1 (A-1001 SSO), S3 (A-1004 webhook: observed facts and possible causes as separate labelled parts), S4 (A-1005 Brazil → Insufficient evidence), S5 (motorcycle → Out of scope) all render as specified in §13.1.

### [x] P07 · Clarification
- **Goal:** the S2b round trip.
- **Refs:** CLR-01–03, §9.3 rule 7.
- **Depends:** P06.
- **Acceptance:**
  - `clarification_required` shows ≤ 2 questions naming the candidate payments, and a reply box with the helper text "Your reply will be used to try again."
  - The reply becomes a new turn in the same conversation; the account stays locked.
  - The result is the scripted S2b follow-up (review reason `exception_unclear`).
  - A third clarification request is shown as Insufficient evidence.
- **Verify:** A-1003 → "Is this payment eligible for a refund?" → reply "the 600 GBP one" → Needs review with the Exception unclear banner; the account is unchanged.

### [x] P08 · Document evidence panel
- **Goal:** document passages, separate from facts.
- **Refs:** §12.2 right pane, §9.4, STL-01.
- **Depends:** P06.
- **Acceptance:**
  - One card per cited passage: title, category, version, effective date, heading, page (PDF only), text, Superseded / Archived / Deleted badges, and "Open document".
  - Conflict: both sources shown under "Conflicting sources" with **no** "the draft follows the policy" text; the acknowledgement checkbox moves to the save area (P09), because it covers every review reason.
  - Empty states: "No document passages cited" for facts-only answers (E12) and out-of-scope answers.
- **Verify:** E06 (A-1003 refund timing) shows Refund policy and Billing FAQ side by side, without a winner.

### [x] P09 · Edit, copy, save
- **Goal:** the review actions and the saved record.
- **Refs:** ANS-02–06, WF-02, §7.6.
- **Depends:** P07, P08.
- **Acceptance:**
  - **Edit:** validated with `validateEdit`; the error is shown inline; "Edited" tag; regenerating over an edit asks "Your edit won't carry over".
  - **Copy answer:** `navigator.clipboard.writeText(stripMarkers(...))` and a toast "Copied without citation markers".
  - **Save reviewed answer:** disabled with the `saveBlockers` hint; the "I've checked the flagged items" checkbox appears when review reasons exist.
  - **Saved record:** final text, reviewer, time, source versions and the cited facts snapshot. The conversation becomes read-only.
  - **Source changed — recheck:** shown on the saved record when `reviewedChanged` is true.
  - No "Approve", "Publish" or "Send" wording anywhere.
- **Verify:** S2a → Copy, then paste: no markers. Save → Saved. Edit with `[9]` → inline error. `grep -riE "approve|publish" frontend/src` finds only comments, if any.

### [ ] P10 · History
- **Goal:** the conversation list.
- **Refs:** WF-03, §4.2.
- **Depends:** P09.
- **Acceptance:**
  - `InboxView.jsx` → `HistoryView.jsx`: columns for account, first question, state, flags, creator and time; newest first.
  - Filters by account and by state, with counts.
  - Flags: "Source updated" (unsaved) and "Source changed — recheck" (saved).
  - Seeded history: one saved S2a conversation (A-1002) and one in each of `needs_review`, `awaiting_clarification` and `insufficient_evidence`, so the list isn't empty on first load.
  - Clicking a row opens it in Ask.
- **Verify:** filter by A-1002 shows only its conversations; the state filter counts add up to the total.

### [ ] P11 · Knowledge base and document page
- **Goal:** KB views aligned with §6.1.
- **Refs:** KB-01–09, IDX-02, §16.
- **Depends:** P03, P04.
- **Acceptance:**
  - List: the existing search, categories and Show archived are kept; sub-step progress bars are removed (badge only).
  - Upload dialog: title, category, effective date (≤ today, validated) and change note fields, plus a canned file. "Simulate an indexing failure" is removed.
  - Replace for Refund policy uses the staged v3 (effective = D).
  - Delete: a confirmation shows "N unsaved answers and M saved answers cite this document", then deletes; saved answers keep their snapshot.
  - Retry only on the latest failed version.
  - Document page:
    - version content with page numbers for PDFs;
    - version history with error and warnings ("Page 2 has no text layer and was not indexed" on the SSO guide);
    - a "Download original" button marked "(prototype: no file)".
  - The old "Cited in" list is removed (it's OPT-4 in §15).
- **Verify:** open the SSO setup guide: the warning shows and the document is Ready. Open Failed payment retries: the error shows and Retry is offered.

## Phase C — Walkthrough

### [ ] P12 · Scenario walkthrough and cleanup
- **Goal:** prove the prototype covers §13.1.
- **Refs:** §13.1 S1–S6, §16, UI-01.
- **Depends:** P10, P11.
- **Acceptance:**
  - S1–S6 all pass in the browser, including S6:
    1. save S2a;
    2. replace Refund policy with v3;
    3. the saved record shows "Source changed — recheck";
    4. asking again cites v3 with the Policy applicability banner.
  - The failure path works: "Next generation fails" → Failed → Retry succeeds.
  - Archiving a cited document marks the unsaved answer "Source updated" and blocks Save; restoring clears it.
  - `lib/model.js` rule tests pass; the build passes; there are no console errors.
  - Leftover mock code is deleted (old `makeDraft`, `demoQs`, `STAGE_TEXT`, `ProgressBar` if unused).
- **Verify:** `node --test frontend/src/lib/model.test.js && npm --prefix frontend run build`; browser walkthrough with screenshots of S1, S2b, S3, S6.

---

## Dependency order

```text
P01 → P02 → P03 → P04 → P05 → P06 → P07 ─┐
                    │            └→ P08 ─┴→ P09 → P10 ─┐
                    └→ P11 ───────────────────────────┴→ P12
```

## Open points

None blocking. Defaults applied:
1. The prototype lives in `frontend/` (not a separate folder), because §12.3 reuses its components.
2. One prototype-only control, "Next generation fails", is the only way to show the `failed` state without a backend. It is labelled and will be removed in production.
3. The account-data failure state (`account_data_unavailable`, CTX-05) isn't separately simulated; it shares the `failed` UI.
