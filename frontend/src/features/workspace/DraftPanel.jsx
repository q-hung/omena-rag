import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Notice from '../../components/ui/Notice';
import ProgressBar from '../../components/ui/ProgressBar';
import { findP } from '../../lib/model';
import DraftText from './DraftText';

const LABELS = { supported: ['Supported', 'positive'], review: ['Needs review', 'alert'], missing: ['Missing evidence', 'alert'] };
const GEN_STEPS = ['Searching current document versions', 'Applying customer plan and account context', 'Drafting answer with citations'];
const CARD = 'border border-hairline bg-white';

export default function DraftPanel({ app, m }) {
  const { state: s, set } = app;
  const { q, g, generating, failed, approved, d, showDraft, conflict, src, outdated, acked } = m;
  const editing = s.editing;
  const lab = d && LABELS[d.status];
  const showLabel = showDraft && !approved && !!lab;

  let approveHint = '';
  if (!approved && showDraft) {
    if (editing) approveHint = 'Save or cancel the edit first.';
    else if (outdated.length) approveHint = 'Regenerate with the current version first.';
    else if (conflict && !acked) approveHint = 'Inspect both conflicting sources first.';
  }
  if (generating) approveHint = 'Approval is unavailable while generating.';
  const approveDisabled = !showDraft || editing || outdated.length > 0 || (!!conflict && !acked);

  const superseded = approved ? Object.values(q.approval.cites).map((id) => findP(id, s.docs)).filter((p) => p && p.superseded) : [];
  const record = approved
    ? [
        ['Reviewer', q.approval.reviewer],
        ['Approved', q.approval.time],
        ['Source versions', q.approval.sources.join(', ')],
        ...(q.history.length ? [['Earlier approvals', String(q.history.length)]] : []),
      ]
    : [];

  return (
    <section className="flex min-w-0 flex-col gap-4 overflow-auto px-8 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{approved ? 'Approved answer' : 'AI draft'}</h2>
        {showLabel && <Badge tone={lab[1]}>{lab[0]}</Badge>}
        {showDraft && !approved && d.edited && <span className="text-xs text-secondary">Edited by reviewer</span>}
        <span className="ml-auto font-mono text-xs text-muted">{!approved && showDraft && d.at ? `Generated ${d.at}` : ''}</span>
      </div>
      {showLabel && <div className="-mt-1.5 text-sm leading-[1.45] text-pretty text-secondary">{d.explain}</div>}

      {showDraft && outdated.length > 0 && !editing && (
        <Notice tag="SOURCE UPDATED" title="This draft uses an older document version" action={<Button size="sm" onClick={() => app.generate(q.id)}>Regenerate</Button>}>
          {outdated.map((p) => `It cites ${p.title} v${p.v}, which has been superseded by v${p.current}. Regenerate to answer from the current version.`).join(' ')}
        </Notice>
      )}

      {conflict && !editing && (
        <Notice tag="CONFLICT" title={`Sources disagree: ${conflict.topic}`}>
          {conflict.summary} Both passages are shown in the evidence panel.
        </Notice>
      )}

      {showDraft && !approved && d.reapprove && (
        <div className="border border-rule bg-white px-4 py-3 text-sm leading-[1.45]">
          <strong>Edited after approval.</strong> The previous approval is kept as a record. This version needs approval again.
        </div>
      )}

      {!d && !generating && !failed && (
        <div className={`flex flex-col items-start gap-4 px-8 py-10 ${CARD}`}>
          <div className="text-lg font-bold">No draft yet</div>
          <div className="max-w-[52ch] text-sm leading-normal text-secondary">
            The assistant searches current document versions, applies this customer's plan and account details, and cites every factual claim.
          </div>
          <Button variant="accent" onClick={() => app.generate(q.id)}>Generate draft</Button>
        </div>
      )}

      {generating && (
        <div className={`flex flex-col gap-5 px-8 py-7 ${CARD}`}>
          <ProgressBar value={`${(g.step + 1) * 33}%`} />
          {GEN_STEPS.map((label, i) => {
            const st = i < g.step ? 'done' : i === g.step ? 'active' : 'pending';
            return (
              <div key={label} className={`flex items-center gap-3 text-sm ${st === 'pending' ? 'text-muted' : 'text-black'} ${st === 'active' ? 'font-bold' : ''}`}>
                <span className="w-5 font-mono">{st === 'done' ? '✓' : st === 'active' ? '→' : '·'}</span>
                {label}
              </div>
            );
          })}
          <div className="text-xs text-muted">Approval is unavailable while the draft is generating.</div>
        </div>
      )}

      {failed && (
        <div className="flex flex-col items-start gap-3 border-2 border-negative bg-white p-6">
          <div className="flex items-center gap-[10px]">
            <Badge tone="negative">Failed</Badge>
            <span className="text-base font-bold">The draft could not be generated</span>
          </div>
          <div className="text-sm leading-normal text-secondary">
            The model request timed out after retrieval (simulated). No draft was saved, and nothing was sent to the customer.
          </div>
          <Button size="sm" onClick={() => app.generate(q.id)}>Retry</Button>
        </div>
      )}

      {(showDraft || approved) && !editing && src?.text && (
        <DraftText text={src.text} cites={src.cites} activeCite={s.activeCite} onCite={(n) => set({ activeCite: n })} />
      )}

      {editing && (
        <div className="flex max-w-[72ch] flex-col gap-2">
          <textarea
            value={s.editText}
            onChange={(e) => set({ editText: e.target.value })}
            className="min-h-[260px] resize-y border-2 border-black bg-white px-6 py-5 text-base leading-[1.6]"
          />
          <div className="text-xs text-muted">Keep citation markers like [1] next to the claims they support.</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => app.saveEdit(q.id)}>Save edit</Button>
            <Button size="sm" variant="ghost" onClick={() => set({ editing: false })}>Cancel</Button>
          </div>
        </div>
      )}

      {showDraft && !approved && d.status === 'missing' && !editing && (
        <div className={`flex max-w-[72ch] flex-col gap-3 px-6 py-5 ${CARD}`}>
          <div className="eyebrow">NOT ESTABLISHED BY THE DOCUMENTATION</div>
          {(d.unknowns || []).map((u) => (
            <div key={u} className="flex gap-[10px] text-sm leading-normal"><span>✦</span><span>{u}</span></div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            {q.reviewRequested ? (
              <span className="text-sm"><strong>Review requested</strong> · Payments team · {q.reviewRequestedAt}</span>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => app.requestReview(q.id)}>Request review from Payments</Button>
            )}
          </div>
        </div>
      )}

      {approved && !editing && (
        <div className={`max-w-[72ch] ${CARD}`}>
          <div className="flex items-center gap-[10px] border-b border-hairline px-6 py-[14px]">
            <Badge tone="positive">Approved</Badge>
            <span className="text-sm font-bold">Approval record</span>
          </div>
          {record.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 border-b border-hairline px-6 py-3 text-sm">
              <span className="text-muted">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
          {superseded.length > 0 && (
            <div className="px-6 py-3 text-sm leading-[1.45] text-secondary">
              Historical record. {superseded[0].title} has since been updated to v{superseded[0].current}; this approval is preserved as sent.
            </div>
          )}
        </div>
      )}

      {(showDraft || approved || generating) && !editing && (
        <div className="flex max-w-[72ch] flex-wrap items-center gap-2 border-t border-hairline pt-2">
          {!approved && <Button size="sm" variant="secondary" disabled={generating} onClick={() => app.generate(q.id)}>Regenerate</Button>}
          <Button size="sm" variant="ghost" disabled={generating} onClick={() => app.startEdit(approved ? q.approval.text : d.text)}>
            {approved ? 'Edit (requires re-approval)' : 'Edit draft'}
          </Button>
          <span className="ml-auto max-w-[30ch] text-right text-xs text-secondary">{approveHint}</span>
          {!approved && <Button size="sm" variant="accent" disabled={approveDisabled} onClick={() => app.approve(q.id)}>Approve</Button>}
        </div>
      )}
    </section>
  );
}
