export function findP(id, docs) {
  if (!id) return null;
  const [docId, vs, k] = id.split('-');
  const d = docs.find(x => x.id === docId); if (!d) return null;
  const ver = d.versions.find(x => x.v === +vs); if (!ver) return null;
  const p = ver.ps.find(x => x.k === k); if (!p) return null;
  return { docId, title: d.title, cat: d.cat, v: ver.v, eff: ver.eff, h: p.h, t: p.t, superseded: d.current != null && ver.v < d.current, current: d.current };
}

export function outdatedOf(q, docs) {
  if (!q.draft || q.approval) return [];
  const out = [];
  Object.values(q.draft.cites).forEach(id => { const p = findP(id, docs); if (p && p.superseded && !out.find(o => o.docId === p.docId)) out.push(p); });
  return out;
}

export function sourceLabels(cites, docs) {
  const s = [];
  Object.values(cites).forEach(id => { const p = findP(id, docs); if (p) { const l = `${p.title} v${p.v}`; if (!s.includes(l)) s.push(l); } });
  return s;
}

export const STATUS_TONE = { 'New': 'neutral', 'Draft ready': 'outline', 'Needs review': 'alert', 'Approved': 'positive' };
export const INGEST_STATUS = { ready: 'Ready', queued: 'Queued', processing: 'Processing', failed: 'Failed' };
export const INGEST_TONE = { ready: 'positive', queued: 'neutral', processing: 'alert', failed: 'negative' };
export const STAGE_TEXT = ['Parsing document', 'Splitting into passages', 'Building search index'];

// Demo clock: the date is pinned to the scenario, the time is real.
export function now() {
  const d = new Date();
  return `2 Oct 2026, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
