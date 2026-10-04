import { useState } from 'react';
import { FileText } from 'lucide-react';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import Input from '../../components/ui/Input';
import { utcToday, fmtDate } from '../../lib/format';
import { ApiError } from '../../lib/api';

const CATS = ['Plans', 'Policies', 'Billing', 'FAQ', 'Security', 'Developer'];
const FIELD = 'flex flex-col gap-1.5 text-sm font-semibold';
const SELECT = 'min-h-11 border-2 border-rule bg-white px-3 text-base font-normal';
const LIMIT = 3 * 1024 * 1024;

export default function UploadDialog({ app }) {
  const kb = app.kb;
  if (!kb.dialog) return null;
  const close = () => kb.setDialog(null);
  const doc = kb.docs.find((d) => d.id === kb.dialog.id) ?? (kb.detail?.id === kb.dialog.id ? kb.detail : null);
  const key = `${kb.dialog.type}-${kb.dialog.id || 'new'}`;
  if (kb.dialog.type === 'delete') return <DeleteDialog key={key} app={app} doc={doc} onClose={close} />;
  return <VersionDialog key={key} app={app} doc={kb.dialog.type === 'replace' ? doc : null} onClose={close} />;
}

function VersionDialog({ app, doc, onClose }) {
  const today = utcToday();
  const [form, setForm] = useState({ title: '', cat: 'Policies', eff: today, note: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pick = (e) => {
    const next = e.target.files?.[0];
    if (!next) return;
    if (next.size > LIMIT) {
      setFile(null);
      setError('Files must be 3 MB or smaller');
      e.target.value = '';
      return;
    }
    setError(null);
    setFile(next);
  };

  const submit = async () => {
    if (!file) return setError('Choose a PDF or Markdown file.');
    if (file.size > LIMIT) return setError('Files must be 3 MB or smaller');
    if (!doc && !form.title.trim()) return setError('Enter a title.');
    if (!form.eff || form.eff > today) return setError(`The effective date must be ${fmtDate(today)} or earlier.`);
    setBusy(true);
    try {
      if (doc) {
        await app.kb.replace(doc.id, { file, effectiveDate: form.eff, note: form.note });
      } else {
        await app.kb.upload({ file, title: form.title, category: form.cat, effectiveDate: form.eff, note: form.note });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open title={doc ? `Replace ${doc.title}` : 'Upload document'} description={doc ? `v${doc.current} is currently active.` : 'Add a new document to the knowledge base.'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-3 border border-rule bg-almost-white px-4 py-[14px]">
          <FileText size={20} />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{file ? file.name : 'Choose a file'}</span>
            <span className="text-xs text-secondary">PDF or Markdown · 3 MB or smaller</span>
          </span>
          <input type="file" accept=".pdf,.md,.markdown,application/pdf,text/markdown,text/plain" className="sr-only" onChange={pick} />
        </label>
        {!doc && (
          <>
            <label className={FIELD}>Title<Input value={form.title} onChange={upd('title')} placeholder="Cancellation policy" /></label>
            <label className={FIELD}>Category
              <select value={form.cat} onChange={upd('cat')} className={SELECT}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
          </>
        )}
        <label className={FIELD}>Effective date<Input type="date" max={today} value={form.eff} onChange={upd('eff')} /></label>
        <label className={FIELD}>Change note<Input value={form.note} onChange={upd('note')} placeholder="What changed" /></label>
        <div className="text-sm leading-normal text-secondary">
          {doc
            ? `v${doc.current} stays active while the new version is indexed, and the new version becomes active only if indexing succeeds.`
            : 'The document can be retrieved once indexing finishes.'}
        </div>
        {error && <div role="alert" className="text-sm font-semibold text-negative">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-hairline pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={submit}>{busy ? 'Uploading…' : 'Upload and index'}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ app, doc, onClose }) {
  const { unsaved, saved } = app.kb.impact;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await app.kb.remove(doc.id);
      if (app.onDeleted) app.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
      setBusy(false);
    }
  };
  return (
    <Dialog open title={`Delete ${doc?.title}?`} description="This can't be undone." onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm leading-normal">
          It removes every version, the original files, the passages and their embeddings.
          <strong> {unsaved} unsaved answer{unsaved === 1 ? '' : 's'} and {saved} saved answer{saved === 1 ? '' : 's'}</strong> cite this document.
          Saved answers keep their text and source snapshot and will be flagged for recheck.
        </div>
        {error && <div role="alert" className="text-sm font-semibold text-negative">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-hairline pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={confirm}>Delete permanently</Button>
        </div>
      </div>
    </Dialog>
  );
}
