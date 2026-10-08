# REQ_V2 archived sections (mock changes §16, change summary §18, follow-ups §19)

## 16. Changes to the mock

Ticked 4 Oct 2026 (T29).

**Remove**
- [x] "Simulate an indexing failure" and the speed setting
- [x] "Load demo data"
- [x] the Evaluations nav item
- [x] "Request review from Payments"
- [x] editing after approval, re-approval and "Earlier approvals"
- [x] the 3-step generation progress (show "Generating…")
- [x] indexing sub-step bars (show the status badge)
- [x] the inbox of customer-submitted questions
- [x] customer names and the "Account manager" context row
- [x] all "Approve"/"publish" wording

**Add**
- [x] login
- [x] account selector
- [x] Account facts panel with `F#` ids
- [x] clarifications (record choices and questions) and reply box
- [x] Copy answer
- [x] Save reviewed answer with acknowledgement
- [x] outcome badges
- [x] gap list
- [x] History view
- [x] real upload form
- [x] Delete with impact count
- [x] Download original
- [x] page numbers, Archived and Deleted badges on evidence cards
- [x] indexing warnings
- [x] regenerate-over-edit confirmation

**Fix**
- [x] archived citations count as stale
- [x] after v3 the refund answer must flag policy applicability instead of denying
- [x] no draft may promise actions (the Brazil "I have asked our payments team")
- [x] header renamed to Jarvis
- [x] the context note says what is and isn't sent
- [x] the conflict banner must not say the draft "follows" one source

---

## 18. Change summary from REQ v2

**Removed**
- `customer` role, customer logins and sessions, `/portal` routes and `/api/portal/*`, customer question submission, per-customer question limits, portal IDOR tests, portal UI and responsive requirement.
- "Approve = publish", publication, Approve button and `answered` status; `answer_reviews` as published answers.
- `questions` table and its `new / draft_ready / needs_review / answered` states; the support inbox of customer questions.
- `users.plan/profile/company`; customer context as a JSON profile.
- Grounding labels `supported / needs_review / missing_evidence`.
- The "non-FAQ beats FAQ, later date wins" precedence rule.
- "No passages → don't call the model" shortcut (facts-only questions need the model).
- Rejecting a PDF because one page has no text layer; magic-byte check for Markdown.
- Open decisions #1 (approve vs send) and #2 (customer logins); C4, C11, C14 from TASKS_V2.md.

**Changed**
- DEC-5 embedding formats (3 Oct 2026, T10): confirmed against `@google/genai` 2.26.0 — `gemini-embedding-2` uses in-text task prefixes (not `taskType`); 768-d output; Flash-Lite thinking is `thinkingBudget: 0`.
- Snapshot format (3 Oct 2026, T08): §5.4 example and CTX-04 match the implementation (prototype `factsFor`): empty sections reuse fact section names (`webhooks`, not `webhook_endpoints`) with the note "No webhook endpoints configured (0 rows)"; values are display-ready (capitalised enums, `30 Sep 2026` dates, "n days before <as_of date>").
- Stub mode, reuse table, Copy fallback and repo docs (3 Oct 2026, TASKS I4–I7): stub behaviour defined in §14; §12.3 lists the prototype files; ANS-03 falls back to selecting text; `CLAUDE.md` / `AGENTS.md` updated.
- Clarifications (3 Oct 2026, TASKS I3): `clarification_questions: string[]` → `clarifications[]` with `choose_record` (fact-id options, labels rendered by the server) and `free_text` (markers validated like `answer`); replies carry `selections` and/or `text` (§7.4, §9.3 rule 6, §9.5, CLR-04).
- Clarification limit text (3 Oct 2026, TASKS I2): §9.3 rule 7 sets a fixed answer text, so the resulting `insufficient_evidence` answer can be saved.
- State precedence (3 Oct 2026, TASKS I1): §4.2 is an ordered table, first match wins; `needs_review` beats `insufficient_evidence` (WF-05).
- Upload limit (3 Oct 2026): 10 MB → 3 MB per file (DESIGN D-5); page and character limits unchanged.
- Conversation ownership (3 Oct 2026): every employee can read all conversations, but only the creator can reply, regenerate, edit or save (AUTH-02, 403 `NOT_OWNER`). Ask shows only my conversations (WF-04); History has Mine / All, defaulting to Mine, and opens other employees' conversations read-only (WF-03). Replaces "any employee can act on any conversation".
- Product: from a reply-drafting tool for customer questions to an internal Product Support Copilot combining SQL facts and documents.
- Workflow: employee selects an account and asks; history is per conversation.
- Approval → **Save reviewed answer** (internal, immutable), with acknowledgement for review reasons.
- `answer_drafts` → `answers` (+ outcome, gaps, review reasons, facts snapshot); `draft_sources` → `answer_sources`; `answer_reviews` → `reviewed_answers` with `document_id`/`version_id` in the snapshot.
- Conflict handling: present both sources and require review; no automatic winner.
- Generation lock: ownership token; no DB transaction held during model calls.
- Budget: atomic reservation and reconciliation including embeddings, failed attempts, retries and evals (was a sum over `provider_calls`).
- Quota: 30 drafts → 50 generation requests per employee per UTC day (clarification rounds also generate).
- Token counts explicitly estimates; actual usage from the provider.
- PII statement: structured identity fields are excluded from prompts; free text may contain personal information.
- Golden set rewritten around accounts and outcomes (E01–E15).
- Stack: pnpm workspace, zod, Vitest; Drizzle confirmed.

**Added**
- Server layering refactor (4 Oct 2026): inserted as M10; LLM-judge renumbered M10 → M11, hybrid retrieval M11 → M12. No requirement changes.
- Hybrid retrieval phase (4 Oct 2026): OPT-9 scheduled as post-MVP milestone M12 (§7.7, SC-6, HYB-01–04, E16–E20). Adds `document_chunks.search_tsv` and `RETRIEVAL_MODE`; default stays `vector` until the baseline. Implemented (7 Oct 2026). Baseline on E01–E20: hit rate 100% (18/18) in both modes, so SC-6 holds only as a tie; default stays `vector` (§7.7).
- LLM-judge phase (4 Oct 2026): OPT-3 scheduled as post-MVP milestone M11 (§13.4, SC-5, JDG-01–05). Eval only; adds `provider_calls.kind = 'judge'`. Not implemented yet.
- Badges (3 Oct 2026): account signal badges computed in code (§5.5, SIG-01/02) and topic badges from cited document categories (ANS-09), shown on questions in Ask and History, with History filters.
- From `docs/DESIGN.md` §9 (v2.1 revision, 3 Oct 2026): 90 s request deadline and 10 s query-embedding timeout (GEN-04); deleted-chunk handling in T2 (GEN-05); abandoned-reservation sweep (COST-04); conversation row lock for every mutating conversation request (LCK-02).
- Structured data: `accounts`, `account_features`, `payments`, `webhook_endpoints`, `webhook_deliveries`; 5 seed accounts; three read-only context functions; fact ids `F#`.
- Four outcomes; four kinds of "missing"; normalisation rules; review reasons.
- Clarification turns (limits, context preservation).
- Copy answer; History view; Account facts panel.
- Staleness for reviewed answers ("Source changed — recheck").
- Lifecycle/save locking protocol (LCK-01).
- Blank PDF page warnings; strict UTF-8 Markdown validation; retry only on the latest version; activation only to a higher version.
- Scenarios S1–S6; optional enhancements list; milestones M0–M9; API surface.
- Folded in from TASKS_V2.md: C1 (conflict sources numbered), C2, C3 (as `as_of`), C5, C6, C7, C8, C9, C10 (DEC-5), C12, C15, C16, C17, C18, C19, C20.

---

## 19. Open questions

No blocking questions. Routine choices are made in §14 (DEC-1–DEC-8). Follow-ups outside this document:
1. Regenerate `TASKS_V2.md` from §17 (the current file targets REQ v2).
2. Update `CLAUDE.md` / `AGENTS.md` ("approve publication to customers" → "save reviewed internal answers") and the portal parts of `docs/DESIGN.md`.
