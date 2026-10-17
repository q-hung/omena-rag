# P16 · Review and feedback (V3 M4)

Status: TASK-08 done; TASK-09 not started
Depends on: P15
Requirements: REQ_V3 §9, §13
Recheck when changed (downstream): P17, P18 (feedback feeds eval/export)

## Amendments received
_none_

Tasks: TASK-08, 09


### TASK-08 — Review and feedback API

**Goal**

Accept, edit, needs work and wrong evidence are enforced by the server and stored as an append-only log.

**Why**

Review is the human gate that makes answers trustworthy, and the stored decisions are the evaluation data (REQ_V3 §12).

**Implementation**

- `server/src/services/rfp-review.service.ts`:
  - `PATCH /api/rfp-answers/:id {editedText}` — REV-01; reuse the marker check from `review.ts`/edit route (`[n]` must be a citation of this answer).
  - `POST /api/rfp-answers/:id/reviews {verdict, note?, flaggedCitations?}` — REV-02 rules; computes `source_stale` with the §7.6 query adapted to `rfp_answer_sources`.
  - Each write: `SELECT … FOR UPDATE` on the question row first (serialises with regenerate's save), latest-answer check, creator check before 409s.
- `GET /api/rfps/:id`: add `sourceStale` flag per latest answer and the review history per question.
- SQL derivation of review state for the list/progress (`RFP_STATE_SQL`), with a shared fixture test against `deriveQuestionState` (RFP-WF-01).

**Acceptance criteria**

- [x] Edit with `[7]` when 2 citations → 400; `answer_text` unchanged after edit
- [x] Accept stores `final_text` = edited text; accept with empty text → 409; review on a non-latest answer → 409 `NOT_LATEST`; review while `processing` → 409
- [x] `wrong_evidence` without citations or with an unknown citation → 400
- [x] Accept → needs work → accept keeps 3 rows; state follows the latest
- [x] Archiving a cited document makes `sourceStale: true`; an accept then stores `source_stale = true`
- [x] SQL and TS state derivations agree on every row; B reviewing A's answer → 403
- [x] New `server/test/rfp-review.test.ts`

**Dependencies**

TASK-04.

**Complexity**

M

---

### TASK-09 — Review UI

**Goal**

The employee works through the RFP question by question with Accept / Edit / Needs work / Wrong evidence and sees where they are.

**Why**

Delivers the full user workflow from REQ_V3 §1.

**Implementation**

- `RfpWorkspaceView.jsx`: action bar; Edit mode reusing the Ask edit pattern (`ConversationPanel.jsx` edit textarea); **Wrong evidence** dialog (checkbox per citation + note, `components/ui/Dialog`); **Needs work** with optional note; "Source updated" badge; review history list under the answer; filter chips by review state; next-question shortcut after a decision.
- Read-only mode for other employees' RFPs (no write buttons), as the History read-only view.
- RFP list shows progress (generated / accepted / failed) and Mine / All.

**Acceptance criteria**

- [ ] Manually with the stub: accept as-is, edit then accept, needs work with note, wrong evidence on citation [1] — each persists across reload and updates the chips and progress
- [ ] Other employee's RFP opens without write actions
- [ ] Regenerating an accepted question shows the new draft as `draft` and the old review in history
- [ ] `pnpm --filter frontend build` passes

**Dependencies**

TASK-05, TASK-08.

**Complexity**

M

**→ Demo milestone 3 (full workflow) after this task.**

---
