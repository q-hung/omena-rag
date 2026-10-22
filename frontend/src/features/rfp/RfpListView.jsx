import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Page, PageHeader } from '../../components/ui/Page';
import { fmtDate } from '../../lib/format';

export default function RfpListView({ app }) {
  const { rfps: r } = app;
  const navigate = useNavigate();
  const [mine, setMine] = useState(true);
  useEffect(() => {
    r.refresh(mine).catch(() => {});
  }, [r.refresh, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader
        title="RFPs"
        subtitle="Draft answers to RFP questions from the knowledge base. Every answer shows the passages behind it. Nothing is sent to customers."
        action={<Button size="sm" onClick={() => navigate('/rfps/new')}>New RFP</Button>}
      />
      <div className="flex gap-2">
        {[[true, 'Mine'], [false, 'All']].map(([v, label]) => (
          <button key={label} type="button" onClick={() => setMine(v)} aria-pressed={mine === v}
            className={`rounded-full px-3 py-1 text-xs font-medium ${mine === v ? 'bg-accent text-white' : 'bg-white text-secondary shadow-xs hover:bg-almost-white'}`}>
            {label}
          </button>
        ))}
      </div>
      {!r.rfps.length && <div className="rounded-xl border border-hairline bg-white shadow-xs p-6 text-sm text-secondary">No RFPs yet.</div>}
      <div className="flex flex-col">
        {r.rfps.map((row) => (
          <button key={row.id} type="button" onClick={() => navigate(`/rfps/${row.id}`)}
            className="flex items-center gap-4 border-b border-hairline bg-white px-4 py-3 text-left hover:bg-almost-white">
            <span className="flex-1 text-sm font-semibold">{row.title}</span>
            {row.status !== 'confirmed' && <span className="text-xs text-secondary">{row.status === 'draft' ? 'Draft' : 'Extraction failed'}</span>}
            {row.status === 'confirmed' && (
              <span className="text-xs text-secondary">
                {row.progress.generated}/{row.progress.total} generated · {row.progress.accepted} accepted
                {row.progress.failed > 0 ? ` · ${row.progress.failed} failed` : ''}
              </span>
            )}
            {!row.ownedByMe && <span className="text-xs text-secondary">Read-only</span>}
            <span className="font-mono text-xs text-muted">{fmtDate(row.createdAt)}</span>
          </button>
        ))}
      </div>
    </Page>
  );
}
