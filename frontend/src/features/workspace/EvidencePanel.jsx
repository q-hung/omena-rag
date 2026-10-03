import Badge from '../../components/ui/Badge';
import Checkbox from '../../components/ui/Checkbox';
import CiteNumber from '../../components/ui/CiteNumber';
import { findP } from '../../lib/model';

export default function EvidencePanel({ app, m }) {
  const { state: s, set, openDoc } = app;
  const { q, generating, approved, d, showDraft, conflict, src, acked } = m;
  const cites = (showDraft || approved) && src ? src.cites : {};

  const evidence = (n, kind) => {
    const p = findP(cites[n], s.docs);
    if (!p) return null;
    const on = String(s.activeCite) === String(n);
    const open = (e) => { e.preventDefault(); e.stopPropagation(); openDoc(p.docId, p.v); };
    return { ...p, n: String(n), kind, on, open, toggle: () => set({ activeCite: on ? null : String(n) }) };
  };

  const conflictItems = conflict ? [evidence(conflict.a, 'Policy'), evidence(conflict.b, 'FAQ')].filter(Boolean) : [];
  const conflictIds = conflict ? [conflict.a, conflict.b] : [];
  const items = Object.keys(cites).filter((n) => !conflictIds.includes(n)).map((n) => evidence(n)).filter(Boolean);
  const caption = generating ? 'Retrieving…' : Object.keys(cites).length ? 'Select a citation to highlight its passage' : '';
  const emptyText = generating
    ? 'Searching current document versions…'
    : d && d.status === 'missing' && !Object.keys(cites).length
      ? 'No supporting passages were found.'
      : 'Evidence appears here once a draft is generated.';

  return (
    <section className="flex flex-col gap-4 overflow-auto border-l border-hairline bg-white p-6">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">EVIDENCE</div>
        <span className="text-xs text-muted">{caption}</span>
      </div>

      {!conflict && items.length === 0 && (
        <div className="border border-hairline bg-almost-white p-4 text-sm leading-normal text-secondary">{emptyText}</div>
      )}

      {conflict && (
        <div className="border-2 border-black">
          <div className="bg-alert px-[14px] py-2 text-xs font-bold tracking-caps text-black">CONFLICTING SOURCES</div>
          {conflictItems.map((e) => (
            <div key={e.n} className={`flex flex-col gap-2 border-b border-hairline p-[14px] ${e.on ? 'bg-supply-green-tint' : ''}`}>
              <div className="flex items-center gap-2">
                <CiteNumber n={e.n} />
                <span className="flex-1 text-sm font-bold">{e.title}</span>
                <span className="text-xs text-secondary">{e.kind}</span>
              </div>
              <div className="font-mono text-xs text-secondary">v{e.v} · Effective {e.eff}</div>
              <div className="text-sm leading-normal"><span className="font-bold">{e.h}.</span> {e.t}</div>
              <a href="#" onClick={e.open} className="text-xs font-semibold">Inspect full document</a>
            </div>
          ))}
          <div className="px-[14px] py-3 text-[13px] leading-[1.45] text-secondary">
            Policy documents normally take precedence over FAQs. The draft follows the policy.
          </div>
          <Checkbox
            checked={acked}
            boxSize={18}
            onChange={() => set((st) => ({ ack: { ...st.ack, [q.id]: !st.ack[q.id] } }))}
            className="min-h-11 w-full border-t border-hairline bg-almost-white px-[14px] text-sm font-semibold"
          >
            I've inspected both sources
          </Checkbox>
        </div>
      )}

      {items.map((e) => (
        <div
          key={e.n}
          onClick={e.toggle}
          className={`flex cursor-pointer flex-col gap-2 bg-white p-[14px] ${e.on ? 'border-2 border-black' : 'border border-hairline'}`}
        >
          <div className="flex items-center gap-2">
            <CiteNumber n={e.n} active={e.on} />
            <span className="flex-1 text-sm font-bold">{e.title}</span>
            {e.superseded && <Badge tone="alert">Superseded</Badge>}
          </div>
          <div className="font-mono text-xs text-secondary">v{e.v} · Effective {e.eff}</div>
          <div className={`-mx-[10px] px-[10px] py-2 text-sm leading-[1.55] ${e.on ? 'bg-supply-green-tint' : ''}`}>
            <span className="font-bold">{e.h}.</span> {e.t}
          </div>
          <a href="#" onClick={e.open} className="text-xs font-semibold">Open document</a>
        </div>
      ))}
    </section>
  );
}
