# Jarvis timeline

The only place for status. One row per phase, in build order. A phase file owns its tasks and acceptance checks. Requirement text stays in `REQ_V2.MD` (Ask / History / KB) and `REQ_V3.MD` (RFP); code cites their `§n` and IDs, so don't renumber them. Open defects: `BUGS.md`.

## Phases

| Phase | Scope | Status | Needs recheck |
|---|---|---|---|
| [P00–P09](phases/P00-09-mvp.md) | MVP: foundations → delivery (T00–T29) | done | — |
| [P10](phases/P10-layering.md) | Server layering refactor (T30–T37) | done | — |
| [P11](phases/P11-judge.md) | LLM-judge support check (T38–T39) | T39 code merged; **live baseline run open** | — |
| [P12](phases/P12-hybrid-rrf.md) | Hybrid retrieval, RRF (T40–T41) | done, default `vector` | — |
| [P13](phases/P13-domain-and-persistence.md) | RFP schema (TASK-01) | done | — |
| [P14](phases/P14-walking-skeleton-one-question-end-to-end.md) | RFP walking skeleton (TASK-02–05) | in progress: TASK-02–04 done | — |
| [P15](phases/P15-multi-question-rfp-processing.md) | RFP extraction + worker (TASK-06–07) | not started | — |
| [P16](phases/P16-review-and-feedback.md) | RFP review + feedback (TASK-08–09) | not started | — |
| [P17](phases/P17-knowledge-quality-reliability-observability.md) | `.txt`, B05, processing view, hybrid (TASK-10–12) | not started | — |
| [P18](phases/P18-evaluation-and-demo-readiness.md) | RFP eval, export, demo (TASK-13–16) | not started | — |
| [P19](phases/P19-rag-observability.md) | RAG tracing, logging, health (TASK-17–21) | proposed, not approved | — |

Context shared by P13–P18: [RFP-CONTEXT.md](phases/RFP-CONTEXT.md) (architecture, strategy, parallelism rules).
**Next:** P14 TASK-05 (TASK-02–04 done). P11 T39 only needs a live Gemini baseline run pasted into the task; it touches no V3 files.

## Changing an earlier phase

1. Edit it in place; mark the spot `Amended <date> → P__`.
2. For each phase in its `Recheck when changed` line, add a line under that phase's `## Amendments received` and put its id in **Needs recheck** above.
3. Clear the flag once the downstream phase is confirmed still valid (tests green, acceptance still true).

## Dependency chain

P00–P09 → P10 → P11, P12 (post-MVP) → P13 → P14 → P15 → P16 → P18. P19 needs P12 + P15, not P16–P18. P17: TASK-10 any time after P13; TASK-11/12 after P15.
