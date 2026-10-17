import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import {
  citesOf, EVIDENCE_LABEL, EVIDENCE_TIP, EVIDENCE_TONE, FILTER_LABEL, QUESTION_STATE_LABEL, QUESTION_STATE_TONE, REVIEW_FILTERS,
} from '../../lib/rfp';
import RfpDraftView from './RfpDraftView';
import RfpReviewPanel from './RfpReviewPanel';
import DraftText from '../workspace/DraftText';
import EvidenceCard from '../workspace/EvidenceCard';

// Walking skeleton: question list | question + answer | evidence cards (REQ_V3 §13).
export default function RfpWorkspaceView({ app }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rfps: r } = app;
  const [selected, setSelected] = useState(null);
  const [activeCite, setActiveCite] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    r.load(id).catch(() => navigate('/rfps'));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = r.rfp && String(r.rfp.id) === String(id) && (r.rfp.progress?.queued > 0 || r.rfp.progress?.processing > 0);
  useEffect(() => {
    if (!live) {
      return undefined;
    }
    const t = setInterval(() => r.load(id).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [live, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rfp = r.rfp && String(r.rfp.id) === String(id) ? r.rfp : null;
  if (!rfp) {
    return null;
  }
  if (rfp.status !== 'confirmed') {
    return <RfpDraftView key={`${rfp.id}-${rfp.status}-${rfp.questions.map((x) => x.id).join()}`} rfp={rfp} rfps={r} />;
  }
  const p = rfp.progress;
  const counts = {};
  for (const x of rfp.questions) {
    counts[x.reviewState] = (counts[x.reviewState] ?? 0) + 1;
  }
  // A filter whose state no longer has questions (e.g. the last Draft was just accepted) falls back to All.
  const active = filter === 'all' || counts[filter] ? filter : 'all';
  const shown = active === 'all' ? rfp.questions : rfp.questions.filter((x) => x.reviewState === active);
  const q = rfp.questions.find((x) => x.id === selected) ?? shown[0] ?? rfp.questions[0];
  const a = q?.latestAnswer;
  const cites = citesOf(a);
  const busy = r.generating === q?.id || q?.status === 'queued' || q?.status === 'processing';
  const err = r.error?.questionId === q?.id ? r.error : null;
  const failedCode = err?.code ?? (q?.status === 'failed' ? q.errorCode : null);
  // Next question in the current list (honours the filter); none on the last one.
  const nextQ = q && shown.find((x) => x.seq > q.seq);
  const select = (qid) => {
    setSelected(qid);
    setActiveCite(null);
  };

  return (
    <>
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-hairline bg-white px-8">
        <h1 className="text-base font-bold">{rfp.title}</h1>
        <span className="ml-auto" />
        <span className="text-xs text-secondary">
          {p.done}/{p.total} drafted · {counts.accepted ?? 0} accepted{p.queued + p.processing > 0 ? ` · ${p.queued + p.processing} in progress` : ''}{p.failed > 0 ? ` · ${p.failed} failed` : ''}
        </span>
        {rfp.ownedByMe && (
          <Button size="sm" disabled={p.pending + p.failed === 0} onClick={() => r.generateAll(rfp.id)}>Generate all</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => navigate('/rfps')}>All RFPs</Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,0.8fr)_minmax(440px,1.7fr)_minmax(300px,1fr)]">
        <section className="flex flex-col overflow-auto border-r border-hairline bg-white">
          <div className="flex flex-wrap gap-1.5 border-b border-hairline p-3">
            {REVIEW_FILTERS.filter((f) => f === 'all' || counts[f]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={active === f}
                className={`px-2 py-1 text-[11px] font-bold uppercase tracking-caps ${active === f ? 'bg-black text-white' : 'bg-almost-white text-black hover:bg-hairline'}`}>
                {FILTER_LABEL[f]}{f === 'all' ? ` ${rfp.questions.length}` : ` ${counts[f]}`}
              </button>
            ))}
          </div>
          {shown.map((x) => (
            <button key={x.id} type="button" onClick={() => select(x.id)}
              className={`flex flex-col gap-2 border-b border-hairline px-5 py-4 text-left ${x.id === q?.id ? 'bg-supply-green-tint' : 'hover:bg-almost-white'}`}>
              <span className="font-mono text-xs text-muted">Q{x.seq}{x.section ? ` · ${x.section}` : ''}</span>
              <span className="text-sm">{x.text}</span>
              <span><Badge tone={QUESTION_STATE_TONE[x.reviewState]}>{QUESTION_STATE_LABEL[x.reviewState]}</Badge></span>
            </button>
          ))}
        </section>

        <section className="flex flex-col gap-5 overflow-auto p-8">
          {q && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="eyebrow">QUESTION {q.seq}</div>
                <p className="text-base font-semibold">{q.text}</p>
              </div>
              <div className="flex items-center gap-3">
                {rfp.ownedByMe && (
                  <Button size="sm" disabled={busy} onClick={() => r.generate(rfp.id, q.id)}>
                    {busy ? 'Generating…' : a ? 'Regenerate' : 'Generate'}
                  </Button>
                )}
                {a && (
                  <span title={EVIDENCE_TIP}>
                    <Badge tone={EVIDENCE_TONE[a.evidenceStatus]}>{EVIDENCE_LABEL[a.evidenceStatus]}</Badge>
                  </span>
                )}
              </div>
              {failedCode && (
                <div className="flex items-center gap-3 border-2 border-black bg-white p-4 text-sm">
                  <span className="flex-1">Generation failed: <span className="font-mono">{failedCode}</span></span>
                  {rfp.ownedByMe && <Button size="sm" variant="secondary" disabled={busy} onClick={() => r.generate(rfp.id, q.id)}>Retry</Button>}
                </div>
              )}
              {a && (
                <>
                  <DraftText text={a.editedText ?? a.answerText} cites={cites} factIds={[]} activeCite={activeCite}
                    onCite={setActiveCite} onFact={() => {}} />
                  <RfpReviewPanel key={`${q.id}-${a.id}`} rfp={rfp} q={q} cites={cites} rfps={r} onNext={nextQ ? () => select(nextQ.id) : undefined} />
                  {a.gaps?.length > 0 && (
                    <div className="max-w-[72ch] border border-hairline bg-almost-white p-4 text-sm">
                      <div className="eyebrow mb-2">GAPS</div>
                      <ul className="list-disc pl-5">
                        {a.gaps.map((g, i) => <li key={i}>{typeof g === 'string' ? g : g.text ?? g.description}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-4 overflow-auto border-l border-hairline bg-white p-6">
          <div className="eyebrow">DOCUMENT EVIDENCE</div>
          {Object.values(cites).map((cite) => (
            <EvidenceCard key={cite.number} cite={cite}
              on={String(activeCite) === String(cite.number)}
              onToggle={() => setActiveCite(String(activeCite) === String(cite.number) ? null : cite.number)}
              onOpen={() => app.openDoc(cite.documentId)} />
          ))}
          {!Object.keys(cites).length && (
            <div className="border border-hairline bg-almost-white p-4 text-sm text-secondary">
              {a ? 'No document passages cited.' : 'Document evidence appears here once an answer is generated.'}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
