import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Notice from '../../components/ui/Notice';
import Tag from '../../components/ui/Tag';
import { SCRIPTS } from '../../data/jarvis';
import Checkbox from '../../components/ui/Checkbox';
import { GAP_LABEL, OUTCOME_LABEL, REASON_TEXT, finalText, saveBlockers, sourcesChanged } from '../../lib/model';
import DraftText from './DraftText';

const CARD = 'border border-hairline bg-white';
const OUTCOME_TONE = { answer: 'outline', clarification_required: 'alert', insufficient_evidence: 'neutral', out_of_scope: 'neutral' };

// Suggested questions for the account, so each demo path is one click.
function suggestions(accountId) {
  const qs = SCRIPTS.filter((x) => x.account === accountId || x.account === '*').map((x) => x.q);
  return [...new Set(qs)];
}

// Centre pane: question composer, turn history and the latest answer (REQ §12.2, ANS-01).
export default function ConversationPanel({ app, conv, account, state: st }) {
  const { state: s } = app;
  if (!conv) return <Composer app={app} account={account} />;

  const last = conv.turns[conv.turns.length - 1];
  return (
    <section className="flex min-w-0 flex-col gap-5 overflow-auto px-8 py-6">
      {conv.turns.map((t) => {
        const a = [...conv.answers].reverse().find((x) => x.turnSeq === t.seq);
        const isLast = t.seq === last.seq;
        return (
          <div key={t.seq} className="flex flex-col gap-4">
            <div className="flex max-w-[72ch] flex-col gap-1 self-start border-l-4 border-black bg-white px-5 py-3">
              <span className="eyebrow">{t.kind === 'question' ? 'QUESTION' : 'YOUR REPLY'}</span>
              <span className="text-base leading-[1.5]">{t.text}</span>
              <span className="font-mono text-xs text-muted">{t.at} · {conv.createdBy}</span>
            </div>
            {isLast && st === 'generating' && (
              <div className={`px-6 py-5 text-sm font-bold ${CARD}`}>Generating…</div>
            )}
            {isLast && st === 'failed' && (
              <div className="flex max-w-[72ch] flex-col items-start gap-3 border-2 border-negative bg-white p-6">
                <div className="flex items-center gap-[10px]">
                  <Badge tone="negative">Failed</Badge>
                  <span className="text-base font-bold">The answer couldn&apos;t be generated</span>
                </div>
                <div className="text-sm leading-normal text-secondary">Simulated provider failure. No answer was saved; your text is kept.</div>
                <Button size="sm" onClick={() => app.regenerate(conv.id)}>Retry</Button>
              </div>
            )}
            {a && !(isLast && ['generating', 'failed'].includes(st)) && (
              <Answer app={app} conv={conv} a={a} full={isLast} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function Composer({ app, account }) {
  const { state: s, set } = app;
  const text = s.questionText;
  return (
    <section className="flex min-w-0 flex-col gap-4 overflow-auto px-8 py-6">
      <h2 className="text-lg font-bold">Ask about {account.company}</h2>
      <div className="flex max-w-[72ch] flex-col gap-2">
        <textarea
          aria-label="Support question"
          value={text}
          maxLength={2000}
          onChange={(e) => set({ questionText: e.target.value })}
          placeholder="Enter a support question about this account…"
          className="min-h-[120px] resize-y border-2 border-rule bg-white px-4 py-3 text-base leading-[1.5] focus:border-interactive focus:outline-none"
        />
        <div className="flex items-start gap-4">
          <span className="flex-1 text-xs leading-[1.45] text-muted">
            Your question is sent to the model as written and may contain personal information. Structured account identifiers are not.
          </span>
          <span className="font-mono text-xs text-muted">{text.length}/2000</span>
          <Button size="sm" disabled={!text.trim()} onClick={() => app.ask(text.trim())}>Ask</Button>
        </div>
      </div>
      <div className="flex max-w-[72ch] flex-col gap-2">
        <div className="eyebrow">SUGGESTED (SCRIPTED)</div>
        <div className="flex flex-wrap gap-2">
          {suggestions(account.id).map((q) => <Tag key={q} onClick={() => app.ask(q)}>{q}</Tag>)}
        </div>
      </div>
    </section>
  );
}

function Answer({ app, conv, a, full }) {
  const { state: s, set } = app;
  const factIds = a.facts.map((f) => f.id);
  const focusFact = (id) => {
    set({ activeFact: id });
    if (id) document.getElementById(`fact-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const textProps = { cites: a.cites, factIds, activeCite: s.activeCite, activeFact: s.activeFact, onCite: (n) => { set({ activeCite: n }); if (n) document.getElementById(`cite-${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, onFact: focusFact };

  if (!full) {
    // Earlier turns are always clarification rounds: show what was asked.
    return (
      <div className={`flex max-w-[72ch] flex-col gap-2 px-6 py-4 ${CARD}`}>
        <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
        {a.questions.map((q) => <DraftText key={q} text={q} boxed={false} {...textProps} />)}
      </div>
    );
  }

  const changed = !conv.reviewed && sourcesChanged(a.cites, s.docs);
  // ANS-05: an edit doesn't carry over to a regenerated answer.
  const regenerate = () => (a.edited == null || window.confirm('Your edit won\'t carry over. Regenerate anyway?')) && app.regenerate(conv.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{conv.reviewed ? 'Saved reviewed answer' : 'Answer'}</h2>
        <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
        {a.edited != null && <span className="text-xs text-secondary">Edited</span>}
        <span className="ml-auto font-mono text-xs text-muted">Generated {a.at}</span>
      </div>

      {changed && (
        <Notice tag="SOURCE UPDATED" title="A cited document changed after this answer was generated"
          action={<Button size="sm" onClick={regenerate}>Regenerate</Button>}>
          A cited version was superseded, archived or deleted. Regenerate to answer from the current documents.
        </Notice>
      )}

      {a.reviewReasons.map((r) => {
        const [tag, title, body] = REASON_TEXT[r];
        const c = r === 'conflict' && a.conflicts[0];
        return (
          <Notice key={r} tag={tag} title={c ? `${title}: ${c.topic}` : title}>
            {c ? `Passages ${c.nums.map((n) => `[${n}]`).join(' and ')} disagree. ` : ''}{body}
          </Notice>
        );
      })}

      {a.fallback && (
        <div className="max-w-[72ch] bg-light-grey px-4 py-3 text-sm">This question has no script in the prototype.</div>
      )}

      {s.editing && !conv.reviewed ? <Editor app={app} conv={conv} /> : finalText(a) && <DraftText text={finalText(a)} {...textProps} />}

      {a.outcome === 'clarification_required' && (
        <div className={`flex max-w-[72ch] flex-col gap-3 px-6 py-5 ${CARD}`}>
          <div className="eyebrow">JARVIS NEEDS MORE INFORMATION</div>
          {a.questions.map((q) => <DraftText key={q} text={q} boxed={false} {...textProps} />)}
          {!conv.reviewed && <Reply app={app} conv={conv} a={a} />}
        </div>
      )}

      {Object.entries(GAP_LABEL).map(([kind, label]) => {
        const gaps = a.gaps.filter((g) => g.kind === kind);
        if (!gaps.length) return null;
        return (
          <div key={kind} className={`flex max-w-[72ch] flex-col gap-2 px-6 py-4 ${CARD}`}>
            <div className="eyebrow">{label.toUpperCase()}</div>
            {gaps.map((g) => (
              <div key={g.detail} className="flex gap-[10px] text-sm leading-normal"><span>✦</span><span>{g.detail}</span></div>
            ))}
          </div>
        );
      })}

      {conv.reviewed && <SavedRecord app={app} conv={conv} />}

      {a.outcome === 'out_of_scope' ? (
        <div className="flex max-w-[72ch] items-center gap-3 border-t border-hairline pt-3">
          <span className="flex-1 text-sm text-secondary">Jarvis answers questions about SubPilot only.</span>
          <Button size="sm" onClick={app.newQuestion}>New question</Button>
        </div>
      ) : conv.reviewed ? (
        <div className="flex max-w-[72ch] items-center gap-2 border-t border-hairline pt-3">
          <Button size="sm" variant="secondary" onClick={() => app.copy(conv.id)}>Copy answer</Button>
          <span className="ml-auto text-xs text-secondary">Saved conversations are read-only. Start a new question to ask again.</span>
        </div>
      ) : (
        !s.editing && <Actions app={app} conv={conv} a={a} regenerate={regenerate} />
      )}
    </div>
  );
}

// CLR-02: the reply is a new turn in the same conversation; the account stays fixed.
function Reply({ app, conv, a }) {
  const { state: s, set } = app;
  const text = s.replyText;
  const chips = SCRIPTS.find((x) => x.id === a.scriptId)?.suggestedReplies || [];
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      <textarea
        aria-label="Clarification reply"
        value={text}
        maxLength={1000}
        onChange={(e) => set({ replyText: e.target.value })}
        className="min-h-[72px] resize-y border-2 border-rule bg-white px-4 py-3 text-base leading-[1.5] focus:border-interactive focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => <Tag key={c} onClick={() => app.reply(conv.id, c)}>{c}</Tag>)}
        <span className="ml-auto text-xs text-muted">Your reply will be used to try again.</span>
        <Button size="sm" disabled={!text.trim()} onClick={() => app.reply(conv.id, text.trim())}>Send reply</Button>
      </div>
    </div>
  );
}

// ANS-02: edits are validated; markers can be removed but not added.
function Editor({ app, conv }) {
  const { state: s, set } = app;
  return (
    <div className="flex max-w-[72ch] flex-col gap-2">
      <textarea
        aria-label="Edit answer"
        value={s.editText}
        onChange={(e) => set({ editText: e.target.value, editError: null })}
        className="min-h-[220px] resize-y border-2 border-black bg-white px-6 py-5 text-base leading-[1.6]"
      />
      {s.editError
        ? <div role="alert" className="text-sm font-semibold text-negative">{s.editError}</div>
        : <div className="text-xs text-muted">Markers like [1] and [F3] can be removed but not added.</div>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => app.saveEdit(conv.id)}>Save edit</Button>
        <Button size="sm" variant="ghost" onClick={app.cancelEdit}>Cancel</Button>
      </div>
    </div>
  );
}

// ANS-03/04: the API's save rules shown as a disabled button with a hint.
function Actions({ app, conv, a, regenerate }) {
  const { state: s } = app;
  const acknowledged = !!s.ack[conv.id];
  const hint = saveBlockers({ conv, docs: s.docs, editing: s.editing, acknowledged });
  const editable = ['answer', 'insufficient_evidence'].includes(a.outcome);
  return (
    <div className="flex max-w-[72ch] flex-col gap-3 border-t border-hairline pt-3">
      {a.reviewReasons.length > 0 && (
        <Checkbox checked={acknowledged} boxSize={18} onChange={() => app.toggleAck(conv.id)} className="min-h-10 text-sm font-semibold">
          I&apos;ve checked the flagged items
        </Checkbox>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={regenerate}>Regenerate</Button>
        {editable && <Button size="sm" variant="ghost" onClick={() => app.startEdit(conv.id)}>Edit</Button>}
        {editable && <Button size="sm" variant="ghost" onClick={() => app.copy(conv.id)}>Copy answer</Button>}
        <span className="ml-auto max-w-[32ch] text-right text-xs text-secondary">{hint}</span>
        <Button size="sm" variant="accent" disabled={!!hint} onClick={() => app.save(conv.id)}>Save reviewed answer</Button>
      </div>
    </div>
  );
}

// The immutable internal record (ANS-04) and its recheck flag (STL-01).
function SavedRecord({ app, conv }) {
  const { state: s } = app;
  const r = conv.reviewed;
  const changed = sourcesChanged(r.sources, s.docs);
  const versions = [...new Set(r.sources.map((x) => `${x.title} v${x.v}`))].join(', ') || 'None';
  const rows = [
    ['Reviewer', r.reviewer],
    ['Saved', r.at],
    ['Source versions', versions],
    ['Facts cited', r.facts.map((f) => f.id).join(', ') || 'None'],
    ['Flags checked', r.acknowledged ? 'Yes' : 'No flags'],
  ];
  return (
    <div className="flex max-w-[72ch] flex-col gap-3">
      {changed && (
        <Notice tag="SOURCE CHANGED — RECHECK" title="A source of this saved answer has changed">
          A cited version was superseded, archived or deleted after saving. The record is kept as saved; recheck before reusing it.
        </Notice>
      )}
      <div className={CARD}>
        <div className="flex items-center gap-[10px] border-b border-hairline px-6 py-[14px]">
          <Badge tone="positive">Saved</Badge>
          <span className="text-sm font-bold">Internal record · not sent to the customer</span>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 border-b border-hairline px-6 py-3 text-sm last:border-b-0">
            <span className="text-muted">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
