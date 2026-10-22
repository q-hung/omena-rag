import Badge from '../../components/ui/Badge';
import CiteNumber from '../../components/ui/CiteNumber';
import { fmtDate } from '../../lib/format';

const STATUS_TONE = { Superseded: 'alert', Archived: 'alert', Deleted: 'negative' };

export default function EvidenceCard({ cite, status, on, onToggle, onOpen }) {
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
