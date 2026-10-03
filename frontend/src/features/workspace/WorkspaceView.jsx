import { ChevronDown, ChevronUp } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { BackButton } from '../../components/ui/Page';
import { STATUS_TONE, outdatedOf } from '../../lib/model';
import QuestionPanel from './QuestionPanel';
import DraftPanel from './DraftPanel';
import EvidencePanel from './EvidencePanel';

const NAV_BTN = 'grid size-9 place-items-center border border-rule bg-white hover:bg-light-grey';

export default function WorkspaceView({ app }) {
  const { state: s, set, openQ } = app;
  const { qs, docs } = s;
  const q = qs.find((x) => x.id === s.selQ) || qs[0];
  const idx = qs.findIndex((x) => x.id === q.id);

  // Draft state shared by the draft and evidence panels.
  const g = s.gen[q.id];
  const generating = !!g && g.s === 'gen';
  const failed = !!g && g.s === 'failed';
  const approved = !!q.approval;
  const d = q.draft;
  const showDraft = !!d && !generating && !failed;
  const conflict = !approved && showDraft && d.conflict ? d.conflict : null;
  const m = {
    q, g, generating, failed, approved, d, showDraft, conflict,
    src: approved ? q.approval : d,
    outdated: outdatedOf(q, docs),
    acked: !!s.ack[q.id],
  };

  return (
    <>
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-hairline bg-white px-8">
        <BackButton onClick={() => set({ view: 'inbox' })}>Inbox</BackButton>
        <span className="h-5 w-px bg-rule" />
        <span className="whitespace-nowrap text-base font-bold">{q.customer}</span>
        <span className="min-w-0 truncate text-sm text-secondary">{q.subject}</span>
        <span className="ml-auto" />
        <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
        <div className="flex gap-1">
          <button type="button" title="Previous question" className={NAV_BTN} onClick={() => openQ(qs[(idx - 1 + qs.length) % qs.length].id)}>
            <ChevronUp size={16} />
          </button>
          <button type="button" title="Next question" className={NAV_BTN} onClick={() => openQ(qs[(idx + 1) % qs.length].id)}>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,0.8fr)_minmax(420px,1.7fr)_minmax(300px,1fr)]">
        <QuestionPanel q={q} />
        <DraftPanel app={app} m={m} />
        <EvidencePanel app={app} m={m} />
      </div>
    </>
  );
}
