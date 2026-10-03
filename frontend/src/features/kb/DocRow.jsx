import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { fmtDate } from '../../lib/format';
import { INGEST_STATUS, INGEST_TONE } from '../../lib/model';

export const DOC_COLS = 'grid-cols-[minmax(0,1fr)_110px_150px_120px_150px_250px]';

export default function DocRow({ app, d }) {
  const st = d.ingest ? d.ingest.stage : 'ready';
  const curV = d.versions.find((v) => v.v === d.current);
  const busy = st === 'queued' || st === 'processing';
  const sub = d.archived ? 'Archived · not retrieved' : curV ? `Uploaded ${curV.up}` : d.staged?.file || 'New upload';
  const verSub = d.staged
    ? `v${d.staged.v} ${st === 'failed' ? 'failed' : 'indexing'}${d.current ? ` · v${d.current} active` : ''}`
    : d.current ? 'Active' : '';
  const warnings = curV?.warnings?.length;

  return (
    <div className={`grid items-center gap-4 border-b border-hairline px-5 py-[14px] ${DOC_COLS} ${d.archived ? 'opacity-60' : ''}`}>
      <button type="button" onClick={() => app.openDoc(d.id)} className="flex flex-col items-start gap-0.5 p-0 text-left text-black hover:opacity-70">
        <span className="text-sm font-bold underline decoration-rule underline-offset-3">{d.title}</span>
        <span className="text-xs text-muted">{sub}</span>
      </button>
      <span className="text-sm">{d.cat}</span>
      <span className="flex flex-col gap-0.5">
        <span className="font-mono text-sm font-semibold">{d.current ? `v${d.current}` : '—'}</span>
        <span className="text-xs text-secondary">{verSub}</span>
      </span>
      <span className="font-mono text-xs text-secondary">{curV ? fmtDate(curV.eff) : '—'}</span>
      <span className="flex flex-col items-start gap-1">
        <Badge tone={INGEST_TONE[st]}>{INGEST_STATUS[st]}</Badge>
        {warnings > 0 && <span className="text-xs text-secondary">{warnings} warning{warnings > 1 ? 's' : ''}</span>}
      </span>
      <span className="flex justify-end gap-1">
        {st === 'failed' && <Button size="sm" onClick={() => app.retry(d.id)}>Retry</Button>}
        {!d.ingest && !d.archived && !!d.current && (
          <Button size="sm" variant="secondary" onClick={() => app.set({ dialog: { type: 'replace', id: d.id } })}>Replace</Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => app.toggleArchive(d)}>{d.archived ? 'Restore' : 'Archive'}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => app.set({ dialog: { type: 'delete', id: d.id } })}>Delete</Button>
      </span>
    </div>
  );
}
