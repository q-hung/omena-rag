import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Notice from '../../components/ui/Notice';
import Tag from '../../components/ui/Tag';
import { SCRIPTS } from '../../data/jarvis';
import { GAP_LABEL, OUTCOME_LABEL, REASON_TEXT, sourcesChanged } from '../../lib/model';
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
  const textProps = { cites: a.cites, factIds, activeCite: s.activeCite, activeFact: s.activeFact, onCite: (n) => set({ activeCite: n }), onFact: focusFact };

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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Answer</h2>
        <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
        {a.edited != null && <span className="text-xs text-secondary">Edited</span>}
        <span className="ml-auto font-mono text-xs text-muted">Generated {a.at}</span>
      </div>

      {changed && (
        <Notice tag="SOURCE UPDATED" title="A cited document changed after this answer was generated"
          action={<Button size="sm" onClick={() => app.regenerate(conv.id)}>Regenerate</Button>}>
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

      {a.text && <DraftText text={a.text} {...textProps} />}

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

      {a.outcome === 'out_of_scope' ? (
        <div className="flex max-w-[72ch] items-center gap-3 border-t border-hairline pt-3">
          <span className="flex-1 text-sm text-secondary">Jarvis answers questions about SubPilot only.</span>
          <Button size="sm" onClick={app.newQuestion}>New question</Button>
        </div>
      ) : (
        !conv.reviewed && (
          <div className="flex max-w-[72ch] flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <Button size="sm" variant="secondary" onClick={() => app.regenerate(conv.id)}>Regenerate</Button>
          </div>
        )
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
