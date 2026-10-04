import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fmtDate } from './format.js';
import { presentDetail, presentList } from './kbPresent.js';

const ready = {
  id: 8,
  versionNumber: 2,
  status: 'ready',
  effectiveAt: '2026-04-03',
  uploadedAt: '2026-10-04T10:00:00Z',
  uploadedBy: 'Ada Nwosu',
  changeNote: 'v2',
  mimeType: 'text/markdown',
  warnings: [],
  chunks: [{ heading: 'Refunds', text: '14 days', pageNumber: null }],
};

const queued = {
  id: 20,
  versionNumber: 3,
  status: 'queued',
  effectiveAt: '2026-10-04',
  uploadedAt: '2026-10-04T11:00:00Z',
  uploadedBy: 'Ada Nwosu',
  changeNote: 'policy applicability',
  mimeType: 'text/markdown',
  warnings: [],
  chunks: [],
};

const doc = {
  id: 2,
  title: 'Refund policy',
  category: 'Policies',
  archivedAt: null,
  activeVersionNumber: 2,
  versions: [queued, ready],
  latest: { id: 20, versionNumber: 3, status: 'queued', error: null },
};

test('presentDetail keeps ready versions and their passages', () => {
  const only = presentDetail({ ...doc, versions: [ready], latest: { id: 8, versionNumber: 2, status: 'ready', error: null } });
  assert.equal(only.staged, null);
  assert.equal(only.versions[0].eff, '2026-04-03');
  assert.equal(only.versions[0].ps[0].t, '14 days');
});

test('presentDetail staged queued version includes eff', () => {
  const out = presentDetail(doc);
  assert.equal(out.staged.eff, '2026-10-04');
  assert.equal(fmtDate(out.staged.eff), '4 Oct 2026');
  assert.equal(out.staged.v, 3);
  assert.equal(out.staged.note, 'policy applicability');
  assert.equal(out.current, 2);
  assert.equal(out.versions.length, 1);
  assert.equal(out.ingest.stage, 'queued');
});

test('presentList still only needs version number while indexing', () => {
  const row = presentList({
    id: 2,
    title: 'Refund policy',
    category: 'Policies',
    archivedAt: null,
    latest: { id: 20, versionNumber: 3, status: 'queued', error: null },
    activeVersion: { id: 8, versionNumber: 2, effectiveAt: '2026-04-03', uploadedAt: '2026-10-04T10:00:00Z', warnings: [] },
  });
  assert.equal(row.staged.v, 3);
  assert.equal(row.current, 2);
});
