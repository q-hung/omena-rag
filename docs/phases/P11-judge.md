# P11 · LLM-judge support check (M11, post-MVP)

Status: T38 done; T39 code merged (`--judge` in `server/eval/`), **live baseline run not recorded**
Depends on: P09
Requirements: REQ_V2 §13.4, SC-5, JDG-01–05
Recheck when changed (downstream): P12 (eval reports), P16/P17 (OPT3-6 judge on RFP answers)

## Amendments received
_none_

Eval only (§13.4). Nothing in the request path or the UI changes.

### [x] T38 · Judge module, claim splitter and calibration set
- **Goal:** judge whether each answer sentence follows from the sources it cites.
- **Refs:** §13.4, JDG-02, JDG-03, JDG-05, §10, COST-03.
- **Depends:** T27. Independent of BUGS B04: grouped markers are caught by the splitter either way.
- **Acceptance:**
  - `server/eval/claims.ts`: `splitClaims(text)` splits into sentences and maps `[F#]` / `[n]` markers to snapshot values and passage text; unresolved marker patterns (e.g. `[S2, S5]`) → `malformed_citation`.
  - `server/eval/judge.ts`: one call per answer through the provider module; zod schema for `{ verdicts[] }`; missing, duplicate or unknown verdicts → `judge_error`.
  - Config: `JUDGE_MODEL`, `JUDGE_PROMPT_VERSION`; refuses when `JUDGE_MODEL = GENERATION_MODEL`.
  - Migration: `provider_calls.kind` CHECK gains `judge`. Each judge call reserves and reconciles budget with `purpose = 'eval'`; no text is stored.
  - `server/eval/judge-labels.json`: ≥ 30 hand-labelled items, including the known-bad cases listed in §13.4.
  - Vitest with a stubbed judge: JDG-02, JDG-03, JDG-05.
- **Verify:** `pnpm --filter server test claims judge` passes; `grep -rn "judge" server/src` finds only the `CALL_KINDS` entry.

### [ ] T39 · Judge in `pnpm eval` and baseline run
- **Goal:** report sentence-level support in the eval and record a baseline.
- **Refs:** §13.4, SC-5, JDG-01, JDG-04, EVAL-01.
- **Depends:** T38.
- **Acceptance:**
  - `pnpm eval --judge` runs the calibration set first, then judges every `answer` / `insufficient_evidence` case; without `--judge`, output and calls are as in T27.
  - The cost estimate printed before the run includes judge and calibration calls.
  - The report adds calibration agreement, support rate, counts per label, malformed citations, judge errors, judge cost, and the `unsupported` / `partial` sentences per case with reasons.
  - Below 85% agreement, or with any hand-labelled `unsupported` item judged `supported`, the report prints "Judge not calibrated — support rate not trusted" (JDG-04, stub test).
- **Verify:** `LLM_PROVIDER=gemini pnpm eval --judge` on a calibrated judge reports support rate ≥ 90% (SC-5). Paste the report into this task and record a hand verdict for every `unsupported` sentence.
