import { FileText } from 'lucide-react';
import Button from '../../components/ui/Button';
import Checkbox from '../../components/ui/Checkbox';
import Dialog from '../../components/ui/Dialog';

// Builds the dialog copy for "replace existing document" or "upload new document".
function dialogContent(dl, docs) {
  if (dl.type !== 'replace') {
    return { title: 'Upload document', description: 'Add a new document to the knowledge base.', file: 'cancellation-policy.pdf', size: '88 KB', newV: 'v1', eff: '2 Oct 2026', note: 'New document · Policies', rule: 'The document can be retrieved once indexing finishes.' };
  }
  const x = docs.find((z) => z.id === dl.id);
  const p = x.pending;
  const cur = x.current, next = x.current + 1;
  return {
    title: `Replace ${x.title}`, description: `v${cur} is currently active.`,
    file: p ? p.file : `${x.id}-v${next}.pdf`, size: p ? p.size : '96 KB', newV: `v${next}`,
    eff: p ? p.eff : '2 Oct 2026', note: p ? p.note : 'Revised upload.',
    rule: `v${cur} stays active while v${next} is indexed. v${next} becomes current only if indexing succeeds. Drafts citing v${cur} will be flagged; approved answers stay as historical records.`,
  };
}

export default function UploadDialog({ app }) {
  const { state: s, set } = app;
  const close = () => set({ dialog: null });
  if (!s.dialog) return null;
  const c = dialogContent(s.dialog, s.docs);

  return (
    <Dialog open title={c.title} description={c.description} onClose={close}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border border-rule bg-almost-white px-4 py-[14px]">
          <FileText size={20} />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{c.file}</span>
            <span className="text-xs text-secondary">{c.size} · demo file</span>
          </span>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <span className="text-muted">New version</span><span className="font-mono font-semibold">{c.newV}</span>
          <span className="text-muted">Effective date</span><span className="font-mono">{c.eff}</span>
          <span className="text-muted">Change</span><span>{c.note}</span>
        </div>
        <div className="text-sm leading-normal text-secondary">{c.rule}</div>
        <Checkbox checked={s.failSim} onChange={() => set((st) => ({ failSim: !st.failSim }))} className="min-h-9 text-sm">
          Simulate an indexing failure
        </Checkbox>
        <div className="flex justify-end gap-2 border-t border-hairline pt-2">
          <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
          <Button size="sm" onClick={app.confirmDialog}>Upload and index</Button>
        </div>
      </div>
    </Dialog>
  );
}
