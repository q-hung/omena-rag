# Code review suggestions

Non-blocking suggestions from code reviews. Blocking issues were fixed in the PR.
Mark `[x]` when done or decided against (add a note).

## P14 TASK-02: structured LLM call (merged, `c7e1699`)

- [ ] **Ask path retry change has no test.** `INVALID_OUTPUT` (malformed JSON, schema mismatch, truncation) is now retryable for `generate` too, which costs budget. Add one Ask-path test and confirm REQ_V2 intends this. `server/src/llm/gemini.ts`
- [ ] **`StructuredInput.kind` is unused.** Required field, never read by `gemini.ts` or `stub.ts`. Wire it into budget reservation or drop it. `server/src/llm/types.ts`
- [ ] **`generate` relies on `this`.** `this.generateStructured` breaks if the method is destructured. Use a closure-local function. Same pattern in `stub.ts`. `server/src/llm/gemini.ts`, `server/src/llm/stub.ts`
- [ ] **Stub S1 regex can match question text.** `\nS1 \|` can match a line inside the question block; anchor it before `<untrusted>`. Only the first line of the S1 passage is read. `server/src/llm/stub.ts`
- [ ] **Oversized question is not capped in the prompt builder.** If the question alone exceeds 6,000 tokens, all passages are dropped and the prompt is still sent. Cap upstream (route zod) or document. `server/src/rag/rfp-prompt.ts`
- [ ] **`prefix` closure recomputed each loop.** Compute once. `server/src/rag/rfp-prompt.ts`
- [ ] **Passages are not wrapped as untrusted.** Instructions say to treat them as data, but only the question is delimited. Consider delimiting passages. `server/src/rag/rfp-prompt.ts`

## P14 TASK-03: RFP create / read API (uncommitted)

- [ ] **`listRfps` is unbounded.** `mine=0` returns every RFP. Add `.limit(100)` or pagination. `server/src/services/rfp.service.ts`
- [ ] **Skeleton hard-coding.** `sourceKind: 'paste'`, `status: 'confirmed'` and a null `sourceText` on create. Add a `// P15 replaces` note so extraction does not build on it. `server/src/services/rfp.service.ts`
- [ ] **`getRfp` runs 5 sequential queries.** Creator, questions and sources are independent; use `Promise.all`. Minor. `server/src/services/rfp.service.ts`
- [ ] **`creator` may be undefined.** A deleted employee gives `createdBy: undefined`. Confirm the FK forbids it. `server/src/services/rfp.service.ts`
- [ ] **Test uses literal `documentId: 1, versionId: 1`.** Passes only because of the seed; select a real seeded version id. `server/test/rfp-api.test.ts`
- [ ] **Confirm read access matches the REQ_V2 owner rule.** Any employee can list (`mine=0`) and read any RFP. Later review and write endpoints must enforce ownership. `server/src/routes/rfps.routes.ts`

## P14 TASK-04: answer one RFP question (`37494b5`)

- [ ] **Unsafe text under INSUFFICIENT status.** When the model says `INSUFFICIENT_EVIDENCE` (or the server downgrades via `no_valid_citation`) with passages present, the model's free text is saved as the answer. Unsupported prose can survive, which hits SC3-3. Replace with the fixed insufficient text when the final status is INSUFFICIENT. Check REQ_V3 §8 and REV-02 first. `server/src/services/rfp-answer.service.ts`
- [ ] **Duplicated retry loop and retrieve options.** `paidRfpGenerate` copies `paidGenerate` in `generate.service.ts`, and the retrieve options block (stub `minScore`, `lexicalQuery`) is repeated. Extract a shared helper before P15 adds a third copy. `server/src/services/rfp-answer.service.ts`, `server/src/services/generate.service.ts`
- [ ] **Failure contract is implicit.** `ProviderError` is swallowed after `failQuestion`, so regenerate returns 200 with the question in state `failed`, while `AppError` is rethrown. Add a comment so the frontend reads `reviewState`, not the status code. `server/src/services/rfp-answer.service.ts`
- [ ] **Per-passage source inserts.** One raw `insert` per passage inside the transaction. Batch into one multi-row insert. Minor. `server/src/services/rfp-answer.service.ts`
- [ ] **Redundant fallback.** `built.promptVersion || RFP_PROMPT_VERSION` can never fall back. Drop it and the extra import. `server/src/services/rfp-answer.service.ts`
- [ ] **Embed retry.** Confirm `embedQuery` retries internally (it uses `withRetries`, so likely fine); add a one-line comment at the call. `server/src/services/rfp-answer.service.ts`
- [ ] **Missing tests.** No test for an exhausted daily budget (AppError path, state `failed`) or for `invalid_citation_removed` through the full flow. `server/test/rfp-answer.test.ts`
