import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';

const MAX = 50;

// Draft mode (REQ_V3 EXT-03): edit, add, delete, reorder the extracted questions, then confirm.
export default function RfpDraftView({ rfp, rfps }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(rfp.questions.map(({ text, section }) => ({ text, section: section ?? '' })));
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const failed = rfp.status === 'extraction_failed';
  const owner = rfp.ownedByMe;

  const set = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => setItems((xs) => {
    const ys = [...xs];
    [ys[i], ys[i + d]] = [ys[i + d], ys[i]];
    return ys;
  });
  const payload = () => items.filter((x) => x.text.trim()).map((x) => ({ text: x.text.trim(), section: x.section.trim() || undefined }));
  const run = async (fn) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const confirm = () => run(async () => {
    if (await rfps.saveQuestions(rfp.id, payload())) {
      await rfps.confirm(rfp.id);
    }
  });

  return (
    <>
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-hairline bg-white px-8">
        <h1 className="text-base font-bold">{rfp.title}</h1>
        <span className="text-xs text-secondary">{failed ? 'Extraction failed' : 'Draft: review the questions'}</span>
        <span className="ml-auto" />
        <Button size="sm" variant="secondary" onClick={() => navigate('/rfps')}>All RFPs</Button>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <div className="flex max-w-[880px] flex-col gap-4">
          {failed && (
            <div className="flex flex-col gap-3 border-2 border-black bg-white p-4 text-sm">
              <div>{rfp.extractionError}</div>
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder="Paste the RFP text instead"
                className="border-2 border-rule p-3 font-mono text-sm outline-none focus:border-interactive" />
              <div><Button size="sm" disabled={!owner || busy || !paste.trim()} onClick={() => run(() => rfps.reextract(rfp.id, paste))}>Extract from pasted text</Button></div>
            </div>
          )}
          {!failed && !items.length && (
            <div className="border border-hairline bg-white p-4 text-sm text-secondary">No questions found. Add them manually.</div>
          )}
          {!failed && items.map((x, i) => (
            <div key={i} className="flex items-start gap-3 border border-hairline bg-white p-3">
              <span className="w-8 pt-2 font-mono text-xs text-muted">Q{i + 1}</span>
              <div className="flex flex-1 flex-col gap-2">
                <textarea value={x.text} rows={2} maxLength={2000} disabled={!owner} onChange={(e) => set(i, { text: e.target.value })}
                  className="border-2 border-rule p-2 text-sm outline-none focus:border-interactive" />
                <input value={x.section} placeholder="Section (optional)" maxLength={200} disabled={!owner} onChange={(e) => set(i, { section: e.target.value })}
                  className="border-2 border-rule p-2 text-xs outline-none focus:border-interactive" />
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="ghost" disabled={!owner || i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
                <Button size="sm" variant="ghost" disabled={!owner || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
                <Button size="sm" variant="ghost" disabled={!owner} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Delete">✕</Button>
              </div>
            </div>
          ))}
          {!failed && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" disabled={!owner || items.length >= MAX} onClick={() => setItems((xs) => [...xs, { text: '', section: '' }])}>Add question</Button>
              <Button size="sm" variant="secondary" disabled={!owner || busy} onClick={() => run(() => rfps.reextract(rfp.id))}>Re-run extraction</Button>
              <Button size="sm" variant="secondary" disabled={!owner || busy} onClick={() => run(() => rfps.saveQuestions(rfp.id, payload()))}>Save draft</Button>
              <span className="ml-auto" />
              <Button disabled={!owner || busy || !payload().length} onClick={confirm}>Confirm questions</Button>
            </div>
          )}
          {!owner && <div className="text-xs text-secondary">Only the employee who created this RFP can edit it.</div>}
        </div>
      </div>
    </>
  );
}
