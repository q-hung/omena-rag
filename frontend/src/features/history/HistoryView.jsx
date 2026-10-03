import Badge from '../../components/ui/Badge';
import Tag from '../../components/ui/Tag';
import { Page, PageHeader } from '../../components/ui/Page';
import { TableEmpty, TableHeader } from '../../components/ui/Table';
import { accountById, accounts } from '../../data/jarvis';
import { STATE_LABEL, STATE_TONE, deriveState, latestAnswer, sourcesChanged } from '../../lib/model';

const COLS = 'grid-cols-[200px_minmax(0,1fr)_220px_200px]';

// Source flags (§4.2): unsaved answers use their citations, saved ones their snapshot.
function flagOf(c, docs) {
  if (c.reviewed) return sourcesChanged(c.reviewed.sources, docs) ? 'Source changed — recheck' : null;
  const a = latestAnswer(c);
  return a && sourcesChanged(a.cites, docs) ? 'Source updated' : null;
}

// All conversations, newest first, filterable by account and state (WF-03).
export default function HistoryView({ app }) {
  const { state: s, set, openConv } = app;
  const rows = s.conversations.map((c) => ({ c, st: deriveState(c, !!s.generating[c.id]), flag: flagOf(c, s.docs) }));
  const byAccount = rows.filter((r) => s.histAccount === 'All' || r.c.accountId === s.histAccount);
  const shown = byAccount.filter((r) => s.histState === 'All' || r.st === s.histState);

  return (
    <Page>
      <PageHeader title="History" subtitle="Questions and answers from every employee. Saved answers are internal records; nothing is sent to customers." />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Tag selected={s.histAccount === 'All'} onClick={() => set({ histAccount: 'All' })}>All accounts · {rows.length}</Tag>
          {accounts.map((a) => (
            <Tag key={a.id} selected={s.histAccount === a.id} onClick={() => set({ histAccount: a.id })}>
              {a.ref} {a.company} · {rows.filter((r) => r.c.accountId === a.id).length}
            </Tag>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag selected={s.histState === 'All'} onClick={() => set({ histState: 'All' })}>All states · {byAccount.length}</Tag>
          {Object.keys(STATE_LABEL).map((st) => (
            <Tag key={st} selected={s.histState === st} onClick={() => set({ histState: st })}>
              {STATE_LABEL[st]} · {byAccount.filter((r) => r.st === st).length}
            </Tag>
          ))}
        </div>
      </div>
      <div className="border border-hairline bg-white">
        <TableHeader cols={COLS} labels={['ACCOUNT', 'QUESTION', 'STATE', 'CREATED']} />
        {shown.map(({ c, st, flag }) => {
          const a = accountById(c.accountId);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => openConv(c.id)}
              className={`grid w-full items-center gap-4 border-b border-hairline bg-white px-5 py-4 text-left hover:bg-almost-white ${COLS}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{a.company}</span>
                <span className="font-mono text-xs text-muted">{a.ref}</span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm">{c.turns[0].text}</span>
                {c.turns.length > 1 && <span className="text-xs text-muted">{c.turns.length - 1} clarification {c.turns.length > 2 ? 'replies' : 'reply'}</span>}
              </span>
              <span className="flex flex-col items-start gap-1">
                <Badge tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Badge>
                {flag && <span className="text-xs font-semibold text-secondary">{flag}</span>}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-secondary">{c.createdAt}</span>
                <span className="text-xs text-muted">{c.createdBy}</span>
              </span>
            </button>
          );
        })}
        {shown.length === 0 && <TableEmpty>No conversations match these filters.</TableEmpty>}
      </div>
    </Page>
  );
}
