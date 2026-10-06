# Jarvis — Bugs

Open defects found after the MVP release (T29). Each entry has the cause,
traced in code, and the smallest fix that clears it. Mark `[x]` only when
the check passes.

---

### [x] B01 · Document page shows raw Markdown
- **Result (4 Oct 2026):** `ChunkBody` renders MD through `react-markdown` + `remark-gfm` (no `rehype-raw`). PDF chunks stay `whitespace-pre-line`. `extractMarkdown` still returns raw syntax. Uploaded `api-access-guide.md`: list, rate-limit table, `Authorization` fence render; `<script>` stays text.

- **Symptom:** on `/kb/:id`, a Markdown document shows `**bold**`, `` `code` ``,
  `- list` items, table pipes and fenced code as literal text. Line breaks
  inside a section collapse into one paragraph.
- **Cause:** `frontend/src/features/kb/DocumentView.jsx:77` renders each chunk
  as `<p>{p.t}</p>`. The chunk text is the section body as written
  (`server/src/extract/markdown.ts`), so the Markdown is never parsed.
  The frontend has no Markdown renderer.
- **Fix:**
  - Add `react-markdown` + `remark-gfm` (tables) to `frontend`. They escape raw
    HTML by default, so uploaded files can't inject markup. Don't enable `rehype-raw`.
  - In `DocumentView`, render `vObj.format === 'md'` chunks through
    `<ReactMarkdown remarkPlugins={[remarkGfm]}>`. Style lists, tables
    and `pre` with Tailwind to match the page.
  - Render PDF chunks as plain text with `whitespace-pre-line`. Their text has
    no Markdown syntax.
- **Out of scope:** citation quotes in `EvidencePanel.jsx` stay plain text. They
  are short excerpts, and parsing half a table makes them harder to read.
  Raise a separate bug if this becomes an issue.
- **Check:** open `docs/sample-uploads/api-access-guide.md` after uploading it:
  the scope list, rate-limit table and `Authorization` code block render
  correctly; a file containing `<script>` shows the text, not an element.

### [x] B02 · Replacing a document blanks the page
- **Result (4 Oct 2026):** `presentDetail` maps `staged` from the full latest row in `d.versions` (same fields as ready versions, including `eff`). Upload button shows "Uploading…" while busy. `App` has a top-level error boundary. Replace Refund policy with v3: page stayed up, v3 showed "Indexing · not active" with its effective date, then became Active.

- **Symptom:** on the document page, Replace → Upload and index → the page goes
  blank. No spinner and no error message appear. Reloading shows the document with v(n+1) indexing.
- **Cause:** after `kb.replace` (`frontend/src/hooks/useDocuments.js:74`) the
  detail is reloaded and its latest version is `queued`. `presentDetail`
  (`frontend/src/lib/kbPresent.js`) sets `staged` to only `{ v, id }`.
  `DocumentView` passes that to `<VersionItem v={dd.staged}>`, which calls
  `fmtDate(v.eff)` with `undefined`. `utc()` in `frontend/src/lib/format.js`
  then throws on `iso.length`. There is no error boundary, so React
  unmounts the whole tree and the page goes blank.
  The polling tick (`useDocuments.js:43`) hits the same path, so the page also
  goes blank when a replace is started from the list page and the document is opened afterwards.
- **Fix:**
  - `presentDetail`: build `staged` from the full latest version in
    `d.versions` (`eff`, `up`, `by`, `note`), using the same mapping as ready
    versions.
  - `UploadDialog.jsx`: while `busy`, label the button "Uploading…". The dialog
    currently gives no sign that work is in progress.
  - Add one top-level error boundary in `App.jsx` that shows "Something went
    wrong — reload" instead of a blank page. A future render error then shows that message instead of a blank page.
- **Check:** a `presentDetail` test with a `queued` latest version returns a
  `staged` that has `eff`. Manually: replace Refund policy v2 with
  `refund-policy-v3.md`. The page stays visible, shows v3 "Indexing · not
  active" with its effective date, and switches to v3 Active when indexing finishes.

### [x] B03 · Percent-encoded paths skip authentication
- **Result (4 Oct 2026):** the `onRequest` hook in `server/src/auth.ts` checks `request.routeOptions.url` (the matched route), and falls back to the raw path only when no route matched. `/%61pi/me`, `/%61pi/accounts`, `/api/%61ccounts`, `/%61pi/documents` and `POST /%61pi/documents/1/archive` with no cookie → 401. Regression test in `server/test/auth.test.ts`.

- **Symptom:** with no session cookie, `GET /%61pi/accounts` returns 200 with
  every account, and `GET /%61pi/accounts/1/facts` returns the account's facts.
  `GET /%61pi/documents` lists the knowledge base, and
  `POST /%61pi/documents/1/archive` archives a document. The `Origin` check
  (SEC-03) doesn't stop this: a non-browser client can set any `Origin`.
- **Cause:** the auth hook (`server/src/auth.ts:49`) decided by the raw URL:
  `request.url.split('?')[0]` must start with `/api/`. The raw URL isn't
  decoded, but Fastify's router decodes percent-escapes before matching. So
  `/%61pi/accounts` fails the `/api/` test and skips the session check, then
  the router sends it to `/api/accounts`. Handlers then run with
  `request.employeeId` undefined. The auth tests only used clean paths.
- **Fix:** decide by the matched route (`request.routeOptions.url`), which is
  the same string the router used. Unmatched paths keep the raw-path check and
  still end in 404.
- **Check:** with no cookie, every encoded path above returns 401, and so do
  the existing clean-path cases.

### [x] B04 · Grouped citations like `[S2, S5]` skip normalisation
- **Result (4 Oct 2026):** `expandGroupedMarkers` splits `[S2, S5]` / `[F1, S3]` (comma or semicolon) before the existing `MARKER` pass. Unknown ids still get `invalid_citation_removed`. `stripMarkers` (server + Copy) expands then strips, so leftover grouped markers don't survive copy. Prompt `v2` says one id per marker.
- **Symptom:** a live answer (A-1002, "How do I use developer API? And what
  is the restriction for my account?") was saved with the raw text
  `… Retry-After header [S2, S5].` Only 3 passages were retrieved, so `S5`
  doesn't exist, and `S2` is "Create an API key", not the rate-limit
  passage. The answer has no `invalid_citation_removed` reason, the evidence
  panel shows no card for the marker, and Copy answer keeps `[S2, S5]` in
  the copied text.
- **Cause:** `MARKER` (`server/src/normalise.ts:11`) matches only single
  markers (`[S2]`, `[F3]`, `[S:key]`). A grouped marker matches neither
  branch, so `resolve()` leaves it untouched: no renumbering, no validation,
  no review reason (NRM-01 rule 1). `stripMarkers` (`normalise.ts:36`) has
  the same blind spot, so ANS-03 copy doesn't remove it either. The prompt
  doesn't forbid grouped markers, and the NRM tests only use single ones.
- **Fix:** in `resolve()`, split grouped markers before the `MARKER` pass:
  `[S2, S5]` / `[F1, S3]` → `[S2][S5]` / `[F1][S3]` (comma or semicolon,
  optional spaces). The existing rules then renumber valid ids, drop unknown
  ones and add `invalid_citation_removed`. Add "one id per marker" to the
  prompt instructions (`prompt.ts`), bumping `PROMPT_VERSION`.
- **Check:** NRM unit test: with passages S1–S3, `x [S2, S5].` → `x [1].`
  plus `invalid_citation_removed`; `[F1, S3]` resolves both. Copy on an
  answer whose model text contained a grouped marker yields no `[`.

### [x] B05 · Large documents embed in one call and can get the wrong vectors
- **Result (6 Oct 2026):** `processVersion` embeds in batches of 100 (`EMBED_BATCH_SIZE`, Gemini's per-request cap). Each batch is its own `paidAttempt`. `vectors.length !== batch.length` throws `INVALID_OUTPUT`; the version is `failed` and no chunks are inserted. `worker.test.ts` covers a short vector list and a 101-chunk document (2 `embed_document` rows; every chunk, including the one in batch 2, stores its own text's vector). The Gemini provider already threw `INVALID_OUTPUT` on a count or dimension mismatch (`server/src/llm/gemini.ts:62`), so live mode never hit the `vectors[0]` fallback; the indexer check guards any provider, including the stub.

- **Symptom:** none seen yet. Found by reading the code while checking how a
  100-page PDF (the upload maximum) is indexed. Two risks: the embed call is
  rejected or times out, so the version fails; or the version becomes `ready`
  while some chunks hold another chunk's vector, so retrieval returns wrong
  passages and nothing reports an error.
- **Cause:**
  - `processVersion` (`server/src/worker.ts:131`) sends every chunk in a
    single `embedDocuments` call. A 100-page PDF gives ~100–200 chunks
    (one per page, split past ~500 tokens). The call has a 20 s timeout
    (`EMBED_DOCS_TIMEOUT_MS`, `server/src/llm/gemini.ts:14`), and Gemini caps
    how many inputs one request may carry. REQ §6.2 step 5 says "Each batch
    reserves budget first", so batching was intended.
  - `server/src/worker.ts:153` sets `embedded.vectors[i] ?? embedded.vectors[0]!`.
    If fewer vectors come back than chunks were sent, every missing chunk gets
    chunk 0's vector. Retrieval then matches those chunks on chunk 0's meaning.
- **Fix:**
  - Split chunks into batches under the provider's per-request limit (check it
    for the configured `EMBEDDING_MODEL`). Run each batch through `paidAttempt`,
    so each one reserves budget and writes its own `provider_calls` row.
  - Replace the fallback with a hard check: `vectors.length !== inputs.length`
    → throw, and the version becomes `failed` with a message that contains no
    document text.
- **Check:** a provider stub returning fewer vectors than chunks → version
  `failed`, no chunks inserted. A document with more chunks than the batch
  size → several embed calls, and each chunk is stored with its own vector.

### [x] B06 · Errors use Fastify's default shape when the SPA is served
- **Result (4 Oct 2026):** `registerErrors` sets the error handler before registering `@fastify/static`. `spa.test.ts` covers a hook error (403 `FORBIDDEN_ORIGIN`) and a validation error (400 `VALIDATION_FAILED`) with `STATIC_DIR` set. The test fails without the fix.

- **Symptom:** in Docker (`STATIC_DIR` set), errors come back as
  `{statusCode, code, error, message}` instead of `{error: {code, message}}`.
  Validation errors show `FST_ERR_VALIDATION` instead of `VALIDATION_FAILED`.
  The 404 handler was not affected.
- **Cause:** `server/src/plugins/errors.ts` (before M10: `app.ts`) ran
  `await app.register(fastifyStatic)` before `setErrorHandler`. The awaited
  register boots the plugin queue, and routes declared earlier keep the error
  handler set at that moment: Fastify's default. Tests didn't set `STATIC_DIR`,
  so they never saw it.
- **Fix:** call `setErrorHandler` before the static register.
- **Check:** `server/test/spa.test.ts` "keeps the app error shape for hook and
  validation errors".
