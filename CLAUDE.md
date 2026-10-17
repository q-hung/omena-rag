# Repository instructions

## Project

Jarvis is an internal Product Support Copilot for Omena, a fictional
SaaS company. It answers employees' questions about the SubPilot
product by combining account facts from PostgreSQL with passages
from the knowledge base.

Employees select an account, ask a question, inspect the account
facts and document evidence, edit and copy the answer, and save it
as a reviewed internal answer. Nothing is sent to customers.

All demo data is synthetic. Live mode must use real retrieval
and model calls; simulated behavior must be clearly labeled.

## Source of truth

- `docs/TIMELINE.md` — phase order, status, next task, and the rule for
  changing an earlier phase. Start here.
- `docs/phases/Pnn-*.md` — tasks and acceptance checks for one phase.
- `REQ_V2.MD` (Ask / History / KB) and `REQ_V3.MD` (RFP) — requirements.
  Large: use `docs/REQ-INDEX.md` for line ranges and read only the section a
  task cites (`scripts/req-index.sh` regenerates it after edits).
- `BUGS.md` — open defects. `HANDOFF.md` — run commands and known limits.
- Old task lists and REQ history: git history only (`git show c1c8a33:TASKS_V2.md`).

Read TIMELINE, the relevant phase file and its `Depends on` phases before
changing code (for `Depends on` phases, only the parts your task touches). If your change touches an earlier phase, follow TIMELINE
"Changing an earlier phase". Report contradictions before implementing
affected behavior. Do not silently expand the MVP.

## Server layers (M10)

`server/src/` is layered. Keep new code in the right place:

- `routes/*.routes.ts` — zod schemas and thin handlers only (validate, call a
  service, set status). Do not import `db/` or `drizzle-orm` here.
- `services/*.service.ts` — business logic and Drizzle queries.
- `plugins/` — cross-cutting hooks (`registerX(app, config)`).
- `rag/`, `ingest/`, `config/` — domain folders; entrypoints stay
  `api.ts`, `worker.ts`, `db/migrate.ts`.

`pnpm check:layers` fails if a route imports `db/` or `drizzle-orm`.

## Code style

Always use explicit `{}` on `if`, `else`, `for` and `while` bodies, with
`} else {` on one line. No single-line `if (x) return;`. `pnpm lint`
(Biome `useBlockStatements`) fails CI otherwise.

## Philosophy

Write code for humans first. Prefer simple, explicit solutions over clever
abstractions. Solve the actual problem, not hypothetical future ones.

Priorities, in order: correctness, readability, maintainability,
observability, performance (when justified).

## Working agreement

1. Read the existing code before modifying it; follow existing patterns and
   search for an existing utility before writing one.
2. Identify the smallest viable change. Keep diffs easy to review; do not
   refactor unrelated code.
3. Before changing logic: identify the business invariants, the existing data
   flow, invalid states and edge cases, and behavior under retries and
   concurrency.
4. Run relevant tests and checks. Report remaining risks honestly.
5. Briefly explain important design tradeoffs.

When reviewing: prioritize correctness and production risk over style,
separate real bugs from preferences, challenge unneeded complexity, and do
not approve code just because it compiles or tests pass.

## Function design

- One clear responsibility and one level of abstraction per function.
- Orchestration functions read like a sequence of business operations;
  helpers explain how.
- Extract meaningful domain operations, not arbitrary blocks or one-line
  wrappers. Prefer fewer cohesive helpers.
- Do not mix SQL, validation, business rules and orchestration when it hides
  intent. Hide query details that obscure business intent.
- Prefer early returns over deep nesting.
- Functions over ~40 lines are a review signal, not a violation.
- Keep dependencies, side effects, transaction boundaries, ordering and
  locking semantics explicit.

```ts
async function replyConversation(input: ReplyInput) {
  const reply = validateReply(input);

  return db.transaction(async (tx) => {
    const conversation = await getOwnedConversation(tx, input);
    const clarification = await getPendingClarification(tx, conversation);

    await assertCanGenerate(tx, input.employeeId);
    return createReplyTurn(tx, conversation, clarification, reply);
  });
}
```

## Simplicity

- No new service, interface, class or pattern without a concrete benefit.
  Ask: what problem does this solve today?
- No speculative abstraction or configurability. Prefer composition over
  inheritance. No premature optimization.

## Database and transactions

- Keep transactions short. Never call external APIs or LLMs inside one.
- Enforce invariants with constraints, not only application code.
- Make duplicate operations idempotent where retries or double-submits can
  happen.
- Avoid N+1 queries; index for real access patterns.
- Add a lock only for a named race, and document why. Ask: what happens when
  two requests run this simultaneously?

## Errors and retries

- Handle expected failures explicitly with domain-specific errors. Never
  swallow exceptions silently.
- Separate retryable from permanent failures. Make an operation idempotent
  before retrying it; bound retries and use backoff.
- Partial workflows must recover safely. Ask: what happens when this fails
  halfway?

## Testing

- Test observable behavior, not implementation. A test must fail when the
  behavior it protects breaks. Ask: what bug would this catch?
- Cover happy paths, edge cases, failure paths and business invariants; add
  concurrency and idempotency tests where relevant.
- Prefer plain tests over elaborate mocking. Never change a test just to make
  incorrect code pass.

## Performance

- Avoid unnecessary queries and repeated work; consider 10x load when
  relevant.
- Do not block the Node.js event loop. Mind connection-pool limits and
  transaction contention.
- Optimize only with evidence or an obvious scalability problem.

## Observability

- Make important business operations observable: structured logs with
  context and correlation IDs, plus metrics for failures, latency and
  resource use when justified.
- Errors must be investigable without local reproduction.
- Never log secrets or sensitive customer data.

## LLM and RAG

- Treat LLM output as untrusted input; validate structured output with
  schemas. Never assume an answer is factually correct.
- Keep retrieval, business logic and generation separate.
- Track token usage, latency and cost. Consider prompt injection and tenant
  isolation.
- Evaluate quality on representative datasets. Use a deterministic workflow
  where an agent is not needed.

## Review checklist

Before submitting: are invariants and business logic correct, functions
cohesive, abstractions necessary, tests able to fail, external calls outside
transactions, and concurrency, retries and 10x load handled?

**Make the correct solution easy to understand and the incorrect solution
hard to introduce.**
