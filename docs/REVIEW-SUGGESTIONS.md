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
