import Badge from '../../components/ui/Badge';
import CiteNumber from '../../components/ui/CiteNumber';
import { fmtDate } from '../../lib/format';
import { citeStatus, latestAnswer } from '../../lib/model';

const STATUS_TONE = { Superseded: 'alert', Archived: 'alert', Deleted: 'negative' };

// Right pane: cited passages, kept separate from account facts (REQ §12.2). No winner is picked on conflicts (§9.4).
export default function EvidencePanel({ app, conv, state: st }) {
  const { state: s, set, openDoc } = app;
  const a = conv && latestAnswer(conv);
  const showing = conv && a && !['generating', 'failed'].includes(st);
  // A saved conversation shows its snapshot; otherwise the latest answer's citations.
  const cites = !showing ? [] : conv.reviewed ? conv.reviewed.sources : Object.entries(a.cites).map(([n, c]) => ({ n, ...c }));
  const conflictNums = showing && !conv.reviewed ? a.conflicts.flatMap((c) => c.nums) : [];
  const card = (c) => <EvidenceCard key={c.n} c={c} status={citeStatus(c, s.docs)} on={String(s.activeCite) === c.n}
    onToggle={() => set({ activeCite: String(s.activeCite) === c.n ? null : c.n })} onOpen={() => openDoc(c.docId, c.v)} />;

  const empty = st === 'generating' ? 'Searching current document versions…'
    : !conv || !a || st === 'failed' ? 'Document evidence appears here once an answer is generated.'
      : 'No document passages cited.';

  return (
    <section className="flex flex-col gap-4 overflow-auto border-l border-hairline bg-white p-6">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">DOCUMENT EVIDENCE</div>
        <span className="text-xs text-muted">{conv?.reviewed ? 'Saved snapshot' : cites.length ? 'Select a citation to highlight it' : ''}</span>
      </div>

      {!cites.length && <div className="border border-hairline bg-almost-white p-4 text-sm leading-normal text-secondary">{empty}</div>}

      {conflictNums.length > 0 && (
        <div className="border-2 border-black">
          <div className="bg-alert px-[14px] py-2 text-xs font-bold tracking-caps text-black">CONFLICTING SOURCES</div>
          <div className="flex flex-col gap-3 p-3">{cites.filter((c) => conflictNums.includes(c.n)).map(card)}</div>
          <div className="border-t border-hairline px-[14px] py-3 text-[13px] leading-[1.45] text-secondary">
            Neither source wins automatically. Decide which applies before saving.
          </div>
        </div>
      )}

      {cites.filter((c) => !conflictNums.includes(c.n)).map(card)}
    </section>
  );
}

function EvidenceCard({ c, status, on, onToggle, onOpen }) {
  return (
    <div id={`cite-${c.n}`} onClick={onToggle}
      className={`flex cursor-pointer flex-col gap-2 bg-white p-[14px] ${on ? 'border-2 border-black' : 'border border-hairline'}`}>
      <div className="flex items-center gap-2">
        <CiteNumber n={c.n} active={on} />
        <span className="flex-1 text-sm font-bold">{c.title}</span>
        {status && <Badge tone={STATUS_TONE[status]}>{status}</Badge>}
      </div>
      <div className="font-mono text-xs text-secondary">
        {c.cat} · v{c.v} · Effective {fmtDate(c.eff)}{c.page ? ` · Page ${c.page}` : ''}
      </div>
      <div className={`-mx-[10px] px-[10px] py-2 text-sm leading-[1.55] ${on ? 'bg-supply-green-tint' : ''}`}>
        <span className="font-bold">{c.h}{/[.?!]$/.test(c.h) ? '' : '.'}</span> {c.t}
      </div>
      {status === 'Deleted'
        ? <span className="text-xs text-muted">Document deleted · passage kept in this record</span>
        : <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }} className="text-xs font-semibold">Open document</a>}
    </div>
  );
}
