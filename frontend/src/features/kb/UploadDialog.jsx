import { useState } from 'react';
import { FileText } from 'lucide-react';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import Input from '../../components/ui/Input';
import { D, fmtDate } from '../../lib/format';

const CATS = ['Plans', 'Policies', 'Billing', 'FAQ', 'Security', 'Developer'];
const FIELD = 'flex flex-col gap-1.5 text-sm font-semibold';
const SELECT = 'min-h-11 border-2 border-rule bg-white px-3 text-base font-normal';

// Upload, Replace (KB-03/04) and Delete (KB-08) dialogs. Files are canned in the prototype.
export default function UploadDialog({ app }) {
  const { state: s, set } = app;
  if (!s.dialog) return null;
  const close = () => set({ dialog: null });
  const doc = s.docs.find((d) => d.id === s.dialog.id);
  // `key` resets the form whenever a different dialog opens.
  const key = `${s.dialog.type}-${s.dialog.id || 'new'}`;
  if (s.dialog.type === 'delete') return <DeleteDialog key={key} app={app} doc={doc} onClose={close} />;
  return <VersionDialog key={key} app={app} doc={s.dialog.type === 'replace' ? doc : null} onClose={close} />;
}

function VersionDialog({ app, doc, onClose }) {
  const p = doc?.pending;
  const [form, setForm] = useState({ title: '', cat: 'Policies', eff: p ? p.eff : D, note: p ? p.note : '' });
  const [error, setError] = useState(null);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const file = doc ? (p ? p.file : `${doc.id}-v${doc.current + 1}.md`) : 'cancellation-policy.md';
  const submit = () => {
    if (!doc && !form.title.trim()) return setError('Enter a title.');
    if (!form.eff || form.eff > D) return setError(`The effective date must be ${fmtDate(D)} or earlier.`);
    app.confirmDialog(form);
  };

  return (
    <Dialog open title={doc ? `Replace ${doc.title}` : 'Upload document'} description={doc ? `v${doc.current} is currently active.` : 'Add a new document to the knowledge base.'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border border-rule bg-almost-white px-4 py-[14px]">
          <FileText size={20} />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{file}</span>
            <span className="text-xs text-secondary">Markdown · prototype file (no picker)</span>
          </span>
        </div>
        {!doc && (
          <>
            <label className={FIELD}>Title<Input value={form.title} onChange={upd('title')} placeholder="Cancellation policy" /></label>
            <label className={FIELD}>Category
              <select value={form.cat} onChange={upd('cat')} className={SELECT}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
          </>
        )}
        <label className={FIELD}>Effective date<Input type="date" max={D} value={form.eff} onChange={upd('eff')} /></label>
        <label className={FIELD}>Change note<Input value={form.note} onChange={upd('note')} placeholder="What changed" /></label>
        <div className="text-sm leading-normal text-secondary">
          {doc
            ? `v${doc.current} stays active while v${doc.current + 1} is indexed, and v${doc.current + 1} becomes active only if indexing succeeds. Answers citing v${doc.current} will be flagged; saved answers keep their snapshot.`
            : 'The document can be retrieved once indexing finishes.'}
        </div>
        {error && <div role="alert" className="text-sm font-semibold text-negative">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-hairline pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit}>Upload and index</Button>
        </div>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ app, doc, onClose }) {
  const { unsaved, saved } = app.impact(doc.id);
  return (
    <Dialog open title={`Delete ${doc.title}?`} description="This can't be undone." onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm leading-normal">
          It removes every version, the original files, the passages and their embeddings.
          <strong> {unsaved} unsaved answer{unsaved === 1 ? '' : 's'} and {saved} saved answer{saved === 1 ? '' : 's'}</strong> cite this document.
          Saved answers keep their text and source snapshot and will be flagged for recheck.
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="danger" onClick={() => app.confirmDialog()}>Delete permanently</Button>
        </div>
      </div>
    </Dialog>
  );
}
