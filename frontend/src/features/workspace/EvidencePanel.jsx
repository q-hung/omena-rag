import Badge from '../../components/ui/Badge';
import CiteNumber from '../../components/ui/CiteNumber';
import { fmtDate } from '../../lib/format';
import { latestAnswer } from '../../lib/model';

const STATUS_TONE = { Superseded: 'alert', Archived: 'alert', Deleted: 'negative' };

// Right pane: cited passages, kept separate from account facts (REQ §12.2).
export default function EvidencePanel({ app, conv, state: st }) {
  const { workspace: w } = app;
  const a = conv && latestAnswer(conv);
  const showing = conv && a && !['generating', 'failed'].includes(st);
  const cites = !showing ? [] : Object.values(a.cites ?? {});
  const conflictNums = showing ? (a.conflicts ?? []).flatMap((c) => c.nums) : [];
  const card = (cite) => (
    <EvidenceCard
      key={cite.number}
      cite={cite}
      status={cite.status}
      on={String(w.activeCite) === String(cite.number)}
      onToggle={() => w.setActiveCite(String(w.activeCite) === String(cite.number) ? null : cite.number)}
      onOpen={() => cite.documentId && app.openDoc(cite.documentId, cite.version)}
    />
  );

  const empty = st === 'generating' ? 'Searching current document versions…'
    : !conv || !a || st === 'failed' ? 'Document evidence appears here once an answer is generated.'
      : 'No document passages cited.';

  return (
    <section className="flex flex-col gap-4 overflow-auto border-l border-hairline bg-white p-6">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">DOCUMENT EVIDENCE</div>
        <span className="text-xs text-muted">{cites.length ? 'Select a citation to highlight it' : ''}</span>
      </div>

      {!cites.length && <div className="border border-hairline bg-almost-white p-4 text-sm leading-normal text-secondary">{empty}</div>}

      {conflictNums.length > 0 && (
        <div className="border-2 border-black">
          <div className="bg-alert px-[14px] py-2 text-xs font-bold tracking-caps text-black">CONFLICTING SOURCES</div>
          <div className="flex flex-col gap-3 p-3">
            {cites.filter((cite) => conflictNums.includes(cite.number) || conflictNums.includes(String(cite.number))).map(card)}
          </div>
          <div className="border-t border-hairline px-[14px] py-3 text-[13px] leading-[1.45] text-secondary">
            Neither source wins automatically. Decide which applies before saving.
          </div>
        </div>
      )}

      {cites.filter((cite) => !conflictNums.includes(cite.number) && !conflictNums.includes(String(cite.number))).map(card)}
    </section>
  );
}

function EvidenceCard({ cite, status, on, onToggle, onOpen }) {
  return (
    <div id={`cite-${cite.number}`} onClick={onToggle}
      className={`flex cursor-pointer flex-col gap-2 bg-white p-[14px] ${on ? 'border-2 border-black' : 'border border-hairline'}`}>
      <div className="flex items-center gap-2">
        <CiteNumber n={cite.number} active={on} />
        <span className="flex-1 text-sm font-bold">{cite.title}</span>
        {status && <Badge tone={STATUS_TONE[status]}>{status}</Badge>}
      </div>
      <div className="font-mono text-xs text-secondary">
        {cite.category}
        {cite.version != null ? ` · v${cite.version}` : ''}
        {cite.effectiveAt ? ` · Effective ${fmtDate(cite.effectiveAt)}` : ''}
        {cite.page ? ` · Page ${cite.page}` : ''}
      </div>
      {cite.text && (
        <div className={`-mx-[10px] px-[10px] py-2 text-sm leading-[1.55] ${on ? 'bg-supply-green-tint' : ''}`}>
          {cite.heading && <span className="font-bold">{cite.heading}{/[.?!]$/.test(cite.heading) ? '' : '.'} </span>}
          {cite.text}
        </div>
      )}
      {status === 'Deleted'
        ? <span className="text-xs text-muted">Document deleted · passage kept in this record</span>
        : cite.documentId ? <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }} className="text-xs font-semibold">Open document</a> : null}
    </div>
  );
}
