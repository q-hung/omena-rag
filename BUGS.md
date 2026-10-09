# Jarvis — Bugs

Open defects only. **None open.** Closed B01-B06 (cause, fix and result) are in git
history: `git show 7cd54ae:BUGS.md`.

- B01 · Document page shows raw Markdown
- B02 · Replacing a document blanks the page
- B03 · Percent-encoded paths skip authentication
- B04 · Grouped citations like `[S2, S5]` skip normalisation
- B05 · Large documents embed in one call and can get the wrong vectors
- B06 · Errors use Fastify's default shape when the SPA is served

Add new defects below as `### [ ] Bnn · title` with symptom, cause and the smallest
fix; mark `[x]` only when the check passes, then drop the entry in the next cleanup.
