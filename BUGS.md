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
