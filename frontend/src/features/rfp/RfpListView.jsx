import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Page, PageHeader } from '../../components/ui/Page';
import { fmtDate } from '../../lib/format';

export default function RfpListView({ app }) {
  const { rfps: r } = app;
  const navigate = useNavigate();
  useEffect(() => {
    r.refresh().catch(() => {});
  }, [r.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader
        title="RFPs"
        subtitle="Draft answers to RFP questions from the knowledge base. Every answer shows the passages behind it. Nothing is sent to customers."
        action={<Button size="sm" onClick={() => navigate('/rfps/new')}>New RFP</Button>}
      />
      {!r.rfps.length && <div className="border border-hairline bg-white p-6 text-sm text-secondary">No RFPs yet.</div>}
      <div className="flex flex-col">
        {r.rfps.map((row) => (
          <button key={row.id} type="button" onClick={() => navigate(`/rfps/${row.id}`)}
            className="flex items-center gap-4 border-b border-hairline bg-white px-4 py-3 text-left hover:bg-almost-white">
            <span className="flex-1 text-sm font-semibold">{row.title}</span>
            {row.status !== 'confirmed' && <span className="text-xs text-secondary">{row.status === 'draft' ? 'Draft' : 'Extraction failed'}</span>}
            <span className="font-mono text-xs text-muted">{fmtDate(row.createdAt)}</span>
          </button>
        ))}
      </div>
    </Page>
  );
}
