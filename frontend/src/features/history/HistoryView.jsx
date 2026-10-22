import { useNavigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Tag from '../../components/ui/Tag';
import { Page, PageHeader } from '../../components/ui/Page';
import { TableEmpty, TableHeader } from '../../components/ui/Table';
import { STATE_LABEL, STATE_TONE } from '../../lib/model';

const COLS = 'grid-cols-[200px_minmax(0,1fr)_220px_200px]';
const TOPICS = ['Plans', 'Policies', 'Billing', 'FAQ', 'Security', 'Developer', 'Account data'];

function flagOf(row) {
  if (row.flags?.sourceChanged) {
    return 'Source changed — recheck';
  }
  if (row.flags?.sourceUpdated) {
    return 'Source updated';
  }
  return null;
}

export default function HistoryView({ app }) {
  const { history: h, accounts } = app;
  const navigate = useNavigate();
  const openRow = (row) => {
    if (row.ownedByMe) {
      app.selectAccount(row.accountId);
      app.workspace.open(row.id);
      navigate('/ask');
    } else {
      navigate(`/history/${row.id}`);
    }
  };

  return (
    <Page>
      <PageHeader title="History" subtitle="Questions and answers from every employee. Saved answers are internal records; nothing is sent to customers." />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Tag selected={h.mine} onClick={() => h.setMine(true)}>Mine</Tag>
          <Tag selected={!h.mine} onClick={() => h.setMine(false)}>All</Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag selected={h.accountId == null} onClick={() => h.setAccountId(null)}>All accounts · {h.rows.length}</Tag>
          {accounts.map((a) => (
            <Tag key={a.id} selected={h.accountId === a.id} onClick={() => h.setAccountId(a.id)}>
              {a.ref} {a.companyName}
            </Tag>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag selected={!h.state} onClick={() => h.setState(null)}>All states</Tag>
          {Object.keys(STATE_LABEL).map((st) => (
            <Tag key={st} selected={h.state === st} onClick={() => h.setState(st)}>
              {STATE_LABEL[st]}
            </Tag>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag selected={!h.signal} onClick={() => h.setSignal(null)}>All signals</Tag>
          <Tag selected={h.signal === 'webhook_failing'} onClick={() => h.setSignal('webhook_failing')}>Webhook failing</Tag>
          <Tag selected={h.signal === 'payment_failed'} onClick={() => h.setSignal('payment_failed')}>Payment failed</Tag>
          <Tag selected={h.signal === 'past_due'} onClick={() => h.setSignal('past_due')}>Past due</Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tag selected={!h.topic} onClick={() => h.setTopic(null)}>All topics</Tag>
          {TOPICS.map((topic) => (
            <Tag key={topic} selected={h.topic === topic} onClick={() => h.setTopic(topic)}>{topic}</Tag>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-hairline bg-white shadow-xs">
        <TableHeader cols={COLS} labels={['ACCOUNT', 'QUESTION', 'STATE', 'CREATED']} />
        {h.rows.map((row) => {
          const flag = flagOf(row);
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => openRow(row)}
              className={`grid w-full items-center gap-4 border-b border-hairline bg-white px-5 py-4 text-left hover:bg-almost-white ${COLS}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{row.companyName}</span>
                <span className="font-mono text-xs text-muted">{row.accountRef}</span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm">{row.question}</span>
                <span className="flex flex-wrap gap-1.5">
                  {(row.signals ?? []).map((signal) => (
                    <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
                  ))}
                  {(row.topics ?? []).map((topic) => (
                    <Badge key={topic} tone="outline">{topic}</Badge>
                  ))}
                </span>
              </span>
              <span className="flex flex-col items-start gap-1">
                <Badge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Badge>
                {flag && <span className="text-xs font-semibold text-secondary">{flag}</span>}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-secondary">{row.createdAt}</span>
                <span className="text-xs text-muted">{row.createdBy?.name}</span>
              </span>
            </button>
          );
        })}
        {h.rows.length === 0 && <TableEmpty>No conversations match these filters.</TableEmpty>}
      </div>
    </Page>
  );
}
