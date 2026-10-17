import { useState } from 'react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Checkbox from '../../components/ui/Checkbox';
import Dialog from '../../components/ui/Dialog';
import { fmtDateTime } from '../../lib/format';
import { QUESTION_STATE_LABEL, QUESTION_STATE_TONE } from '../../lib/rfp';

const NOTE_MAX = 1000;

// Accept / Edit / Needs work / Wrong evidence for the latest answer (REQ_V3 REV-01..04), plus the review history.
// Read-only for other employees: no write buttons.
export default function RfpReviewPanel({ rfp, q, cites, rfps, onNext }) {
  const a = q.latestAnswer;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [dialog, setDialog] = useState(null); // 'needs_work' | 'wrong_evidence'
  const [note, setNote] = useState('');
  const [flagged, setFlagged] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = rfp.ownedByMe && !['queued', 'processing'].includes(q.status);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    const message = await fn();
    setBusy(false);
    if (message) {
      setError(message);
    }
    return !message;
  };
  const submit = async (verdict, extra = {}) => {
    if (await run(() => rfps.review(a.id, { verdict, ...extra }))) {
      setDialog(null);
      setNote('');
      setFlagged([]);
    }
  };
  const startEdit = () => {
    setText(a.editedText ?? a.answerText);
    setError('');
    setEditing(true);
  };
  const saveEdit = async () => {
    if (await run(() => rfps.saveEdit(a.id, text))) {
      setEditing(false);
    }
  };
  const toggle = (n) => setFlagged((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n]));
  const reviewed = q.reviewState === 'accepted' || q.reviewState === 'needs_work' || q.reviewState === 'wrong_evidence';

  return (
    <div className="flex max-w-[72ch] flex-col gap-4">
      {!rfp.ownedByMe && (
        <div className="border border-hairline bg-almost-white p-3 text-xs text-secondary">
          You can read this RFP, its evidence and its reviews. Only its creator can review or edit it.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
        {a.editedText != null && <span>Edited</span>}
        {a.sourceStale && <Badge tone="alert">Source updated</Badge>}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea aria-label="Edit answer" value={text} rows={8} onChange={(e) => setText(e.target.value)}
            className="border-2 border-rule bg-white p-3 text-base outline-none focus:border-interactive" />
          <div className="text-xs text-secondary">Markers like [1] can be removed but not added.</div>
          {error && <div className="text-sm text-negative">{error}</div>}
          <div className="flex gap-3">
            <Button size="sm" disabled={busy} onClick={saveEdit}>Save edit</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          {error && !dialog && <div className="text-sm text-negative">{error}</div>}
          {canWrite && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="accent" disabled={busy} onClick={() => submit('accepted')}>Accept</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={startEdit}>Edit</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setError(''); setDialog('needs_work'); }}>Needs work</Button>
              <Button size="sm" variant="secondary" disabled={busy || !Object.keys(cites).length}
                onClick={() => { setError(''); setDialog('wrong_evidence'); }}>Wrong evidence</Button>
              {reviewed && <Button size="sm" variant="ghost" onClick={onNext}>Next question →</Button>}
            </div>
          )}
        </>
      )}

      <Dialog open={!!dialog} onClose={() => setDialog(null)} width={520}
        title={dialog === 'wrong_evidence' ? 'Wrong evidence' : 'Needs work'}
        description={dialog === 'wrong_evidence' ? 'Which citations point at the wrong passage?' : 'Optionally say what to fix.'}>
        <div className="flex flex-col gap-4">
          {dialog === 'wrong_evidence' && (
            <div className="flex flex-col gap-2">
              {Object.values(cites).map((c) => (
                <Checkbox key={c.number} checked={flagged.includes(c.number)} onChange={() => toggle(c.number)}>
                  <span className="text-sm">[{c.number}] {c.title}{c.heading ? `, ${c.heading}` : ''}</span>
                </Checkbox>
              ))}
            </div>
          )}
          <textarea aria-label="Note" value={note} rows={3} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)" className="border-2 border-rule p-3 text-sm outline-none focus:border-interactive" />
          {error && <div className="text-sm text-negative">{error}</div>}
          <div className="flex gap-3">
            <Button size="sm" disabled={busy || (dialog === 'wrong_evidence' && !flagged.length)}
              onClick={() => submit(dialog, { note: note.trim() || undefined, ...(dialog === 'wrong_evidence' && { flaggedCitations: flagged }) })}>
              Submit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
          </div>
        </div>
      </Dialog>

      {q.reviewHistory?.length > 0 && (
        <div className="border border-hairline bg-white p-4">
          <div className="eyebrow mb-2">REVIEW HISTORY</div>
          <ul className="flex flex-col gap-2 text-sm">
            {[...q.reviewHistory].reverse().map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={QUESTION_STATE_TONE[r.verdict]}>{QUESTION_STATE_LABEL[r.verdict]}</Badge>
                <span className="font-mono text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
                {r.answerId !== a.id && <span className="text-xs text-secondary">earlier draft</span>}
                {r.flaggedCitations?.length > 0 && <span className="text-xs">flagged {r.flaggedCitations.map((n) => `[${n}]`).join(' ')}</span>}
                {r.sourceStale && <Badge tone="alert">Source updated</Badge>}
                {r.note && <span className="w-full text-secondary">{r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
