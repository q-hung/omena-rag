import { useState } from 'react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Notice from '../../components/ui/Notice';
import Tag from '../../components/ui/Tag';
import Checkbox from '../../components/ui/Checkbox';
import { copyAnswer } from '../../lib/copy';
import { GAP_LABEL, OUTCOME_LABEL, REASON_TEXT, finalText, saveHint } from '../../lib/model';
import DraftText from './DraftText';

const CARD = 'border border-hairline bg-white';
const OUTCOME_TONE = { answer: 'outline', clarification_required: 'alert', insufficient_evidence: 'neutral', out_of_scope: 'neutral' };

const SUGGESTIONS = {
  'A-1001': ["Why can't this account enable SSO?"],
  'A-1002': ['Is this payment eligible for a refund?', 'What plan is this account on and when was it last charged?'],
  'A-1003': ['Is this payment eligible for a refund?', 'How long until an approved refund arrives?'],
  'A-1004': ["Why is this account's webhook failing?"],
  'A-1005': ['Can this account take payments in Brazil?'],
  '*': ["Why won't my motorcycle start?"],
};

function suggestions(ref) {
  return [...(SUGGESTIONS[ref] ?? []), ...SUGGESTIONS['*']];
}

export default function ConversationPanel({ app, conv, account, state: st, readOnly = false }) {
  const { workspace: w } = app;
  if (!conv) {
    return <Composer app={app} account={account} />;
  }

  const last = conv.turns[conv.turns.length - 1];
  return (
    <section className="flex min-w-0 flex-col gap-5 overflow-auto px-8 py-6">
      {readOnly && (
        <Notice tag="READ-ONLY" title="Started by another employee — read-only">
          You can read the turns, answer, facts and evidence, and copy the answer. You can&apos;t reply, edit, regenerate or save.
        </Notice>
      )}
      {conv.turns.map((t) => {
        const a = [...conv.answers].reverse().find((x) => x.turnSeq === t.seq);
        const isLast = t.seq === last.seq;
        return (
          <div key={t.seq} className="flex flex-col gap-4">
            <div className="flex max-w-[72ch] flex-col gap-1 self-start border-l-4 border-black bg-white px-5 py-3">
              <span className="eyebrow">{t.kind === 'question' ? 'QUESTION' : 'YOUR REPLY'}</span>
              <span className="text-base leading-[1.5]">{t.text || (t.selectedFacts ?? []).join(', ')}</span>
              <span className="font-mono text-xs text-muted">{t.at} · {conv.createdBy?.name}</span>
            </div>
            {isLast && st === 'generating' && (
              <div className={`px-6 py-5 text-sm font-bold ${CARD}`}>Generating…</div>
            )}
            {isLast && st === 'failed' && !readOnly && (
              <div className="flex max-w-[72ch] flex-col items-start gap-3 border-2 border-negative bg-white p-6">
                <div className="flex items-center gap-[10px]">
                  <Badge tone="negative">Failed</Badge>
                  <span className="text-base font-bold">The answer couldn&apos;t be generated</span>
                </div>
                <div className="text-sm leading-normal text-secondary">No answer was saved; your text is kept.</div>
                <Button size="sm" onClick={() => w.regenerate(conv.id)}>Retry</Button>
              </div>
            )}
            {a && !(isLast && ['generating', 'failed'].includes(st)) && (
              <Answer app={app} conv={conv} a={a} full={isLast} readOnly={readOnly} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function Composer({ app, account }) {
  const { workspace: w, simulated } = app;
  const text = w.questionText;
  return (
    <section className="flex min-w-0 flex-col gap-4 overflow-auto px-8 py-6">
      <h2 className="text-lg font-bold">Ask about {account.companyName}</h2>
      {w.generating && <div className={`max-w-[72ch] px-6 py-5 text-sm font-bold ${CARD}`}>Generating…</div>}
      <div className="flex max-w-[72ch] flex-col gap-2">
        <textarea
          aria-label="Support question"
          value={text}
          maxLength={2000}
          onChange={(e) => w.setQuestionText(e.target.value)}
          placeholder="Enter a support question about this account…"
          className="min-h-[120px] resize-y border-2 border-rule bg-white px-4 py-3 text-base leading-[1.5] focus:border-interactive focus:outline-none"
        />
        <div className="flex items-start gap-4">
          <span className="flex-1 text-xs leading-[1.45] text-muted">
            Your question is sent to the model as written and may contain personal information. Structured account identifiers are not.
          </span>
          <span className="font-mono text-xs text-muted">{text.length}/2000</span>
          <Button size="sm" disabled={!text.trim() || w.generating} onClick={() => w.ask(text.trim())}>Ask</Button>
        </div>
      </div>
      {simulated && (
        <div className="flex max-w-[72ch] flex-col gap-2">
          <div className="eyebrow">SUGGESTED (SCRIPTED)</div>
          <div className="flex flex-wrap gap-2">
            {suggestions(account.ref).map((q) => <Tag key={q} onClick={() => w.ask(q)}>{q}</Tag>)}
          </div>
        </div>
      )}
      {!!w.list.length && (
        <div className="flex max-w-[72ch] flex-col gap-2">
          <div className="eyebrow">YOUR QUESTIONS FOR THIS ACCOUNT</div>
          {w.list.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => w.open(row.id)}
              className="flex flex-col items-start gap-1.5 border border-hairline bg-white px-4 py-3 text-left hover:border-black"
            >
              <span className="text-sm font-semibold leading-[1.4]">{row.question}</span>
              <span className="flex flex-wrap gap-1.5">
                {(row.signals ?? []).map((signal) => (
                  <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
                ))}
                {(row.topics ?? []).map((topic) => (
                  <Badge key={topic} tone="outline">{topic}</Badge>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Answer({ app, conv, a, full, readOnly }) {
  const { workspace: w } = app;
  const factIds = (a.facts ?? []).map((f) => f.id);
  const focusFact = (id) => {
    w.setActiveFact(id);
    if (id) {
      document.getElementById(`fact-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  const textProps = {
    cites: a.cites,
    factIds,
    activeCite: w.activeCite,
    activeFact: w.activeFact,
    onCite: (n) => {
      w.setActiveCite(n);
      if (n) {
        document.getElementById(`cite-${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
    onFact: focusFact,
  };

  if (!full) {
    return (
      <div className={`flex max-w-[72ch] flex-col gap-2 px-6 py-4 ${CARD}`}>
        <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
        {(a.questions ?? []).map((q) => <DraftText key={q} text={q} boxed={false} {...textProps} />)}
      </div>
    );
  }

  const regenerate = () => {
    if (a.edited && !window.confirm("Your edit won't carry over")) {
      return;
    }
    w.regenerate(conv.id);
  };
  const copy = () => copyAnswer(finalText(a), {
    onCopied: () => app.toast('Copied without citation markers.'),
    onFallback: () => app.toast('Press ⌘C / Ctrl+C to copy'),
  });
  const locked = readOnly || !!conv.reviewed;
  const hint = saveHint(conv, { generating: w.generating, editing: w.editing, acknowledged: w.ack });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{conv.reviewed ? 'Saved reviewed answer' : 'Answer'}</h2>
        <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
        {a.edited != null && <span className="text-xs text-secondary">Edited</span>}
        <span className="ml-auto font-mono text-xs text-muted">Generated {a.at}</span>
      </div>

      {conv.flags?.sourceUpdated && !conv.reviewed && (
        <Notice tag="SOURCE UPDATED" title="A cited document changed after this answer was generated"
          action={!locked && <Button size="sm" onClick={regenerate}>Regenerate</Button>}>
          A cited version was superseded, archived or deleted. Regenerate to answer from the current documents.
        </Notice>
      )}
      {conv.flags?.sourceChanged && (
        <Notice tag="SOURCE CHANGED" title="Source changed — recheck">
          A cited document was replaced, archived or deleted after this answer was saved. The saved text is unchanged.
        </Notice>
      )}

      {(a.reviewReasons ?? []).map((r) => {
        const [tag, title, body] = REASON_TEXT[r] ?? [r, r, ''];
        const c = r === 'conflict' && a.conflicts?.[0];
        return (
          <Notice key={r} tag={tag} title={c ? `${title}: ${c.topic}` : title}>
            {c ? `Passages ${(c.nums ?? []).map((n) => `[${n}]`).join(' and ')} disagree. ` : ''}{body}
          </Notice>
        );
      })}

      {a.fallback && (
        <div className="max-w-[72ch] bg-light-grey px-4 py-3 text-sm">This question has no scripted answer.</div>
      )}

      {w.editing && !locked ? (
        <div className="flex max-w-[72ch] flex-col gap-2">
          <textarea
            aria-label="Edit answer"
            value={w.editText}
            onChange={(e) => w.setEditText(e.target.value)}
            className="min-h-[160px] resize-y border-2 border-rule bg-white px-4 py-3 text-base leading-[1.5] focus:border-interactive focus:outline-none"
          />
          {w.editError && <div className="text-sm text-negative">{w.editError}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => w.saveEdit(a.id)}>Save edit</Button>
            <Button size="sm" variant="ghost" onClick={w.cancelEdit}>Cancel</Button>
          </div>
        </div>
      ) : (
        finalText(a) && <DraftText text={finalText(a)} {...textProps} />
      )}

      {a.outcome === 'clarification_required' && !locked && (
        <ReplyBox app={app} conv={conv} a={a} />
      )}
      {a.outcome === 'clarification_required' && locked && (
        <div className={`flex max-w-[72ch] flex-col gap-3 px-6 py-5 ${CARD}`}>
          <div className="eyebrow">JARVIS NEEDS MORE INFORMATION</div>
          {(a.questions ?? []).map((q) => <DraftText key={q} text={q} boxed={false} {...textProps} />)}
        </div>
      )}

      {Object.entries(GAP_LABEL).map(([kind, label]) => {
        const gaps = (a.gaps ?? []).filter((g) => g.kind === kind);
        if (!gaps.length) {
          return null;
        }
        return (
          <div key={kind} className={`flex max-w-[72ch] flex-col gap-2 px-6 py-4 ${CARD}`}>
            <div className="eyebrow">{label.toUpperCase()}</div>
            {gaps.map((g) => (
              <div key={g.detail} className="flex gap-[10px] text-sm leading-normal"><span>✦</span><span>{g.detail}</span></div>
            ))}
          </div>
        );
      })}

      {a.outcome === 'out_of_scope' && !readOnly ? (
        <div className="flex max-w-[72ch] items-center gap-3 border-t border-hairline pt-3">
          <span className="flex-1 text-sm text-secondary">Jarvis answers questions about SubPilot only.</span>
          <Button size="sm" onClick={w.newQuestion}>New question</Button>
        </div>
      ) : (
        <div className="flex max-w-[72ch] flex-col gap-3 border-t border-hairline pt-3">
          {!locked && (a.reviewReasons ?? []).length > 0 && (
            <Checkbox checked={!!w.ack} onChange={() => w.setAck(!w.ack)} boxSize={18} className="min-h-10 text-sm font-semibold">
              I&apos;ve checked the flagged items
            </Checkbox>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!locked && <Button size="sm" variant="secondary" onClick={regenerate}>Regenerate</Button>}
            {!locked && <Button size="sm" variant="ghost" onClick={() => w.startEdit(a)}>Edit</Button>}
            <Button size="sm" variant="ghost" onClick={copy}>Copy answer</Button>
            {!locked && a.outcome !== 'clarification_required' && a.outcome !== 'out_of_scope' && (
              <Button size="sm" disabled={!!hint} title={hint ?? ''} onClick={() => w.save(conv.id, a.id)}>
                Save reviewed answer
              </Button>
            )}
            {hint && !locked && (
              <span className="ml-auto max-w-[36ch] text-right text-xs text-secondary">{hint}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReplyBox({ app, conv, a }) {
  const { workspace: w } = app;
  const choose = (a.clarifications ?? []).filter((c) => c.kind === 'choose_record');
  const free = (a.clarifications ?? []).filter((c) => c.kind === 'free_text');
  const [picks, setPicks] = useState(() => Object.fromEntries(choose.map((_, i) => [i, ''])));
  const [notes, setNotes] = useState(() => Object.fromEntries(choose.map((_, i) => [i, ''])));
  const [freeText, setFreeText] = useState('');

  const submit = () => {
    const selections = Object.values(picks).filter((id) => id && id !== 'none');
    const text = [
      ...Object.entries(picks).filter(([, id]) => id === 'none').map(([i]) => notes[i]).filter(Boolean),
      freeText.trim(),
    ].filter(Boolean).join('\n');
    w.reply(conv.id, { selections, text: text || undefined });
  };

  return (
    <div className={`flex max-w-[72ch] flex-col gap-4 px-6 py-5 ${CARD}`}>
      <div className="eyebrow">JARVIS NEEDS MORE INFORMATION</div>
      {choose.map((c, i) => (
        <fieldset key={c.prompt} className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{c.prompt}</legend>
          {(c.options ?? []).map((o) => (
            <label key={o.fact} className="flex items-start gap-2 text-sm">
              <input type="radio" name={`choose-${i}`} checked={picks[i] === o.fact} onChange={() => setPicks((p) => ({ ...p, [i]: o.fact }))} />
              <span>{o.label}</span>
            </label>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name={`choose-${i}`} checked={picks[i] === 'none'} onChange={() => setPicks((p) => ({ ...p, [i]: 'none' }))} />
            <span>None of these</span>
          </label>
          {picks[i] === 'none' && (
            <textarea
              aria-label="Note"
              value={notes[i] ?? ''}
              maxLength={1000}
              onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))}
              placeholder="Add a note"
              className="min-h-[72px] resize-y border-2 border-rule bg-white px-3 py-2 text-sm focus:border-interactive focus:outline-none"
            />
          )}
        </fieldset>
      ))}
      {free.map((c) => (
        <label key={c.question} className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">{c.question}</span>
          <textarea
            value={freeText}
            maxLength={1000}
            onChange={(e) => setFreeText(e.target.value)}
            className="min-h-[72px] resize-y border-2 border-rule bg-white px-3 py-2 text-sm focus:border-interactive focus:outline-none"
          />
        </label>
      ))}
      <div className="text-xs text-muted">Your reply will be used to try again.</div>
      <Button size="sm" disabled={w.generating} onClick={submit}>Reply</Button>
    </div>
  );
}
