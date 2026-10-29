import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// OBS-03: collapsible, plain table. Loads on open and whenever `refreshKey` changes (the workspace poll).
export default function RfpProcessingPanel({ rfpId, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    api(`/rfps/${rfpId}/processing`).then(setData).catch(() => setData(null));
  }, [open, rfpId, refreshKey]);

  const t = data?.totals;
  return (
    <section className="flex-none border-t border-hairline bg-white">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-8 py-3 text-left text-sm font-medium">
        <span className="text-muted">{open ? '▾' : '▸'}</span> Processing
        {t && <span className="ml-2 text-xs font-normal text-secondary">
          {t.calls} calls · {t.failures} failed · {t.inputTokens + t.outputTokens} tokens · ${t.costUsd.toFixed(4)} · p95 {t.p95LatencyMs == null ? '-' : `${Math.round(t.p95LatencyMs)} ms`}
        </span>}
      </button>
      {open && (
        <div className="max-h-64 overflow-auto px-8 pb-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 pr-3">Q</th><th className="pr-3">Status</th><th className="pr-3">Attempts</th>
                <th className="pr-3">Error</th><th className="pr-3">Retrieved</th><th className="pr-3">Cited</th>
                <th className="pr-3">Calls (kind · ms · tokens in/out · cost)</th>
              </tr>
            </thead>
            <tbody>
              {(data?.questions ?? []).map((q) => (
                <tr key={q.id} className="border-t border-hairline align-top">
                  <td className="py-1 pr-3 font-mono">Q{q.seq}</td>
                  <td className="pr-3">{q.status}</td>
                  <td className="pr-3">{q.attempts}</td>
                  <td className="pr-3 font-mono">{q.errorCode ?? '-'}</td>
                  <td className="pr-3">{q.retrievedCount}</td>
                  <td className="pr-3">{q.citedCount}</td>
                  <td className="pr-3">
                    {q.calls.map((c) => (
                      <div key={c.id} className="font-mono">
                        {c.kind}#{c.attempt} {c.status === 'error' ? `✗ ${c.errorCode ?? ''}` : '✓'} · {c.latencyMs ?? '-'} · {c.inputTokens ?? '-'}/{c.outputTokens ?? '-'} · ${c.costUsd.toFixed(6)}
                      </div>
                    ))}
                    {!q.calls.length && '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data && <p className="py-2 text-xs text-secondary">Loading…</p>}
        </div>
      )}
    </section>
  );
}
