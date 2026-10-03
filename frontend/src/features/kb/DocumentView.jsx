import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Panel from '../../components/ui/Panel';
import { BackButton, Page } from '../../components/ui/Page';
import { INGEST_STATUS, INGEST_TONE, STAGE_TEXT } from '../../lib/model';

const ORDER = ['queued', 'processing', 'ready'];

export default function DocumentView({ app, doc: dd }) {
  const { state: s, set } = app;
  const viewV = s.selDocV ?? dd.current;
  const vObj = dd.versions.find((v) => v.v === viewV);
  const st = dd.ingest ? dd.ingest.stage : 'ready';
  const si = st === 'failed' ? 1 : ORDER.indexOf(st);
  const openReplace = () => set({ dialog: { type: 'replace', id: dd.id }, failSim: false });

  const ingestNote = !dd.staged ? '' : dd.current
    ? st === 'failed' ? `v${dd.current} remains active.` : `v${dd.current} stays active until v${dd.staged.v} is ready.`
    : 'No version is active yet.';

  const pipeline = ['Queued', 'Processing', st === 'failed' ? 'Failed' : 'Ready'].map((label, i) => {
    const bad = st === 'failed' && i === 2;
    return {
      label: i === 1 && st === 'processing' ? `Processing · ${STAGE_TEXT[dd.ingest.step]}` : label,
      bar: bad ? 'bg-negative' : i <= si ? 'bg-black' : 'bg-light-grey',
      fg: bad ? 'text-negative' : i <= si ? 'text-black' : 'text-muted',
      bold: i === si,
    };
  });

  return (
    <Page>
      <BackButton onClick={() => set({ view: 'kb' })} className="h-8 self-start">Knowledge base</BackButton>

      <div className="flex items-end gap-4 border-b-4 border-black pb-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="eyebrow">{dd.cat.toUpperCase()}</div>
          <h1 className="text-4xl font-bold">{dd.title}</h1>
        </div>
        <Badge tone={INGEST_TONE[st]}>{INGEST_STATUS[st] + (dd.archived ? ' · Archived' : '')}</Badge>
        {!dd.ingest && !dd.archived && !!dd.current && <Button size="sm" onClick={openReplace}>Replace</Button>}
        {st === 'failed' && <Button size="sm" onClick={() => app.retry(dd.id)}>Retry indexing</Button>}
      </div>

      {dd.ingest && (
        <div className="flex flex-col gap-[14px] border border-hairline bg-white px-6 py-5">
          <div className="flex items-baseline gap-3">
            <span className="text-base font-bold">Indexing v{dd.staged ? dd.staged.v : ''}</span>
            <span className="text-sm text-secondary">{ingestNote}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {pipeline.map((p) => (
              <div key={p.label} className="flex flex-col gap-2">
                <div className={`h-1 ${p.bar}`} />
                <span className={`text-[13px] ${p.fg} ${p.bold ? 'font-bold' : ''}`}>{p.label}</span>
              </div>
            ))}
          </div>
          {st === 'failed' && (
            <div className="text-sm leading-[1.45] text-black">
              <strong className="text-negative">Failed.</strong> {dd.ingest.error}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-8">
        <div className="flex flex-col gap-4">
          {vObj && viewV !== dd.current && (
            <div className="flex items-center gap-3 bg-light-grey px-4 py-3 text-sm">
              <span className="flex-1">You are viewing <strong>v{vObj.v}</strong>, a previous version. It is not used for new answers.</span>
              <a href="#" onClick={(e) => { e.preventDefault(); set({ selDocV: null }); }} className="font-semibold">View current</a>
            </div>
          )}
          {vObj ? (
            <div className="flex flex-col gap-6 border border-hairline bg-white px-10 py-8">
              <div className="flex gap-6 font-mono text-xs text-secondary">
                <span>v{vObj.v}</span><span>Effective {vObj.eff}</span><span>Uploaded {vObj.up}</span>
              </div>
              {vObj.ps.map((p) => (
                <div key={p.k} className="flex max-w-[68ch] flex-col gap-1.5">
                  <h3 className="text-lg font-bold">{p.h}</h3>
                  <p className="text-base leading-[1.6] text-pretty">{p.t}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-hairline bg-white px-10 py-8 text-sm text-secondary">No version of this document has finished indexing yet.</div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="VERSION HISTORY">
            {dd.staged && (
              <VersionItem
                v={dd.staged}
                label={st === 'failed' ? 'Failed' : 'Indexing · not active'}
                tone={st === 'failed' ? 'negative' : 'alert'}
                className="bg-almost-white"
                disabled
              />
            )}
            {dd.versions.map((v) => (
              <VersionItem
                key={v.v}
                v={v}
                label={v.v === dd.current ? 'Current' : 'Previous'}
                tone={v.v === dd.current ? 'positive' : 'outline'}
                selected={v.v === viewV}
                className={v.v === viewV ? 'bg-supply-green-tint' : 'bg-white'}
                onClick={() => set({ selDocV: v.v })}
              />
            ))}
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function VersionItem({ v, label, tone, selected, disabled, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full flex-col gap-2 border-b border-hairline px-5 py-[14px] text-left text-black ${className}`}
    >
      <span className="flex items-center gap-[10px]">
        <span className="font-mono text-base font-bold">v{v.v}</span>
        <Badge tone={tone}>{label}</Badge>
        {selected && <span className="ml-auto text-xs text-secondary">Viewing</span>}
      </span>
      <span className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <span className="text-muted">Effective</span><span className="font-mono">{v.eff}</span>
        <span className="text-muted">Uploaded</span><span className="font-mono">{v.up || '—'}</span>
        <span className="text-muted">By</span><span>{v.by || '—'}</span>
      </span>
      <span className="text-[13px] text-secondary">{v.note}</span>
    </button>
  );
}
