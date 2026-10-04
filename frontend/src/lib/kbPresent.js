import { fmtDateTime } from './format';

function presentVersion(v) {
  return {
    id: v.id,
    v: v.versionNumber,
    format: v.mimeType?.includes('pdf') ? 'pdf' : 'md',
    pages: v.pageCount,
    eff: v.effectiveAt,
    up: v.uploadedAt ? fmtDateTime(v.uploadedAt) : '',
    by: v.uploadedBy,
    note: v.changeNote,
    warnings: v.warnings ?? [],
    ps: (v.chunks ?? []).map((c, i) => ({
      k: `${v.id}-${i}`,
      h: c.heading || '',
      t: c.text,
      page: c.pageNumber,
    })),
  };
}

export function presentList(d) {
  const latest = d.latest;
  const active = d.activeVersion;
  const indexing = latest && latest.status !== 'ready';
  return {
    id: d.id,
    title: d.title,
    cat: d.category,
    archived: !!d.archivedAt,
    current: active?.versionNumber ?? null,
    versions: active
      ? [{
          id: active.id,
          v: active.versionNumber,
          eff: active.effectiveAt,
          up: active.uploadedAt ? fmtDateTime(active.uploadedAt) : '',
          warnings: active.warnings ?? [],
        }]
      : [],
    staged: indexing ? { v: latest.versionNumber } : null,
    ingest: indexing ? { stage: latest.status, error: latest.error } : null,
  };
}

export function presentDetail(d) {
  const ready = (d.versions ?? []).filter((v) => v.status === 'ready');
  const latest = d.latest ?? d.versions?.[0];
  const indexing = latest && latest.status !== 'ready';
  const staged = indexing ? (d.versions ?? []).find((v) => v.id === latest.id) ?? latest : null;
  return {
    id: d.id,
    title: d.title,
    cat: d.category,
    archived: !!d.archivedAt,
    current: d.activeVersionNumber,
    versions: ready.map(presentVersion),
    staged: staged ? presentVersion(staged) : null,
    ingest: indexing ? { stage: latest.status, error: latest.error } : null,
  };
}
