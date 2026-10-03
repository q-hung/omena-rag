import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ProgressBar from '../../components/ui/ProgressBar';
import { INGEST_STATUS, INGEST_TONE, STAGE_TEXT } from '../../lib/model';

export const DOC_COLS = 'grid-cols-[minmax(0,1fr)_120px_150px_130px_250px_170px]';

export default function DocRow({ app, d }) {
  const st = d.ingest ? d.ingest.stage : 'ready';
  const curV = d.versions.find((v) => v.v === d.current);
  const pendingWord = st === 'failed' ? 'failed' : 'pending';
  const sub = d.archived ? 'Archived · not retrieved' : curV ? `Uploaded ${curV.up}` : d.staged ? d.staged.file || 'New upload' : '';
  const verSub = d.ingest && d.staged
    ? d.current ? `v${d.staged.v} ${pendingWord} · v${d.current} active` : `v${d.staged.v} ${pendingWord}`
    : d.current ? 'Active' : '';
  const stageText = st === 'processing' ? STAGE_TEXT[d.ingest.step] : st === 'queued' ? 'Waiting to start' : st === 'failed' ? 'See details' : '';
  const pct = st === 'queued' ? '6%' : st === 'processing' ? `${(d.ingest.step + 1) * 30}%` : '0%';

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
      <span className="font-mono text-xs text-secondary">{curV ? curV.eff : '—'}</span>
      <span className="flex flex-col items-start gap-1.5">
        <span className="flex items-center gap-2">
          <Badge tone={INGEST_TONE[st]}>{INGEST_STATUS[st]}</Badge>
          <span className="text-xs text-secondary">{stageText}</span>
        </span>
        {(st === 'processing' || st === 'queued') && <ProgressBar value={pct} className="h-[3px] w-[200px]" />}
      </span>
      <span className="flex justify-end gap-1">
        {st === 'failed' && <Button size="sm" onClick={() => app.retry(d.id)}>Retry</Button>}
        {!d.ingest && !d.archived && !!d.current && (
          <Button size="sm" variant="secondary" onClick={() => app.set({ dialog: { type: 'replace', id: d.id }, failSim: false })}>Replace</Button>
        )}
        <Button size="sm" variant="ghost" disabled={!!d.ingest && st !== 'failed'} onClick={() => app.toggleArchive(d)}>
          {d.archived ? 'Restore' : 'Archive'}
        </Button>
      </span>
    </div>
  );
}
