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

- REQ_V2.MD defines product requirements.
- TASKS.md defines implementation tasks and progress.
- AGENTS.md defines repository working instructions.

Read the relevant requirements and task before changing code.
Report contradictions before implementing affected behavior.
Do not silently expand the MVP.