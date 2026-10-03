import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Notice from '../../components/ui/Notice';
import Tag from '../../components/ui/Tag';
import { SCRIPTS } from '../../data/jarvis';
import Checkbox from '../../components/ui/Checkbox';
import { GAP_LABEL, OUTCOME_LABEL, REASON_TEXT, finalText, stripMarkers } from '../../lib/model';
import DraftText from './DraftText';

const CARD = 'border border-hairline bg-white';
const OUTCOME_TONE = { answer: 'outline', clarification_required: 'alert', insufficient_evidence: 'neutral', out_of_scope: 'neutral' };

function suggestions(accountId) {
  const qs = SCRIPTS.filter((x) => x.account === accountId || x.account === '*').map((x) => x.q);
  return [...new Set(qs)];
}

// Centre pane: question composer, turn history and the latest answer (REQ §12.2, ANS-01).
export default function ConversationPanel({ app, conv, account, state: st }) {
  const { workspace: w } = app;
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
              <span className="font-mono text-xs text-muted">{t.at} · {conv.createdBy?.name}</span>
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
                <div className="text-sm leading-normal text-secondary">No answer was saved; your text is kept.</div>
                <Button size="sm" onClick={() => w.regenerate(conv.id)}>Retry</Button>
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
            {suggestions(account.id).map((q) => <Tag key={q} onClick={() => w.ask(q)}>{q}</Tag>)}
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

function Answer({ app, conv, a, full }) {
  const { workspace: w } = app;
  const factIds = (a.facts ?? []).map((f) => f.id);
  const focusFact = (id) => {
    w.setActiveFact(id);
    if (id) document.getElementById(`fact-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const textProps = {
    cites: a.cites,
    factIds,
    activeCite: w.activeCite,
    activeFact: w.activeFact,
    onCite: (n) => {
      w.setActiveCite(n);
      if (n) document.getElementById(`cite-${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

  const regenerate = () => w.regenerate(conv.id);
  const copy = () => {
    const text = stripMarkers(finalText(a));
    navigator.clipboard?.writeText(text).then(
      () => app.toast('Copied without citation markers.'),
      () => app.toast('Copy failed: the clipboard isn\'t available here.'),
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{conv.reviewed ? 'Saved reviewed answer' : 'Answer'}</h2>
        <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
        {a.edited != null && <span className="text-xs text-secondary">Edited</span>}
        <span className="ml-auto font-mono text-xs text-muted">Generated {a.at}</span>
      </div>

      {conv.flags?.sourceUpdated && (
        <Notice tag="SOURCE UPDATED" title="A cited document changed after this answer was generated"
          action={<Button size="sm" onClick={regenerate}>Regenerate</Button>}>
          A cited version was superseded, archived or deleted. Regenerate to answer from the current documents.
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

      {finalText(a) && <DraftText text={finalText(a)} {...textProps} />}

      {a.outcome === 'clarification_required' && (
        <div className={`flex max-w-[72ch] flex-col gap-3 px-6 py-5 ${CARD}`}>
          <div className="eyebrow">JARVIS NEEDS MORE INFORMATION</div>
          {(a.questions ?? []).map((q) => <DraftText key={q} text={q} boxed={false} {...textProps} />)}
        </div>
      )}

      {Object.entries(GAP_LABEL).map(([kind, label]) => {
        const gaps = (a.gaps ?? []).filter((g) => g.kind === kind);
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

      {a.outcome === 'out_of_scope' ? (
        <div className="flex max-w-[72ch] items-center gap-3 border-t border-hairline pt-3">
          <span className="flex-1 text-sm text-secondary">Jarvis answers questions about SubPilot only.</span>
          <Button size="sm" onClick={w.newQuestion}>New question</Button>
        </div>
      ) : (
        <div className="flex max-w-[72ch] flex-col gap-3 border-t border-hairline pt-3">
          {(a.reviewReasons ?? []).length > 0 && (
            <Checkbox checked={false} boxSize={18} className="min-h-10 text-sm font-semibold" disabled>
              I&apos;ve checked the flagged items
            </Checkbox>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={regenerate}>Regenerate</Button>
            <Button size="sm" variant="ghost" onClick={copy}>Copy answer</Button>
            <span className="ml-auto max-w-[32ch] text-right text-xs text-secondary">
              Edit, reply and save land in the next milestone.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
