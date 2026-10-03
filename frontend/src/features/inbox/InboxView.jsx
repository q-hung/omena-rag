import Badge from '../../components/ui/Badge';
import Tag from '../../components/ui/Tag';
import { Page, PageHeader } from '../../components/ui/Page';
import { TableEmpty, TableHeader } from '../../components/ui/Table';
import { STATUS_TONE, outdatedOf } from '../../lib/model';

const COLS = 'grid-cols-[200px_minmax(0,1fr)_110px_150px_170px]';
const FILTERS = ['All', 'New', 'Draft ready', 'Needs review', 'Approved'];

export default function InboxView({ app }) {
  const { state: s, set, openQ } = app;
  const rows = s.qs.filter((q) => s.filter === 'All' || q.status === s.filter);

  return (
    <Page>
      <PageHeader title="Support inbox" subtitle="Select a question to open its answer workspace." />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Tag key={f} selected={s.filter === f} onClick={() => set({ filter: f })}>
            {f} · {f === 'All' ? s.qs.length : s.qs.filter((q) => q.status === f).length}
          </Tag>
        ))}
      </div>
      <div className="border border-hairline bg-white">
        <TableHeader cols={COLS} labels={['CUSTOMER', 'QUESTION', 'PLAN', 'RECEIVED', 'STATUS']} />
        {rows.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => openQ(q.id)}
            className={`grid w-full items-center gap-4 border-b border-hairline bg-white px-5 py-4 text-left hover:bg-almost-white ${COLS}`}
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{q.customer}</span>
              <span className="text-xs text-muted">{q.company}</span>
            </span>
            <span className="truncate text-sm text-secondary">{q.text}</span>
            <span className="text-sm">{q.plan}</span>
            <span className="font-mono text-xs text-secondary">{q.received}</span>
            <span className="flex flex-col items-start gap-1">
              <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
              {outdatedOf(q, s.docs).length > 0 && <span className="text-xs text-secondary">Source updated</span>}
            </span>
          </button>
        ))}
        {rows.length === 0 && <TableEmpty>No questions with this status.</TableEmpty>}
      </div>
    </Page>
  );
}
