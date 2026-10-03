import Badge from '../../components/ui/Badge';
import { fmtDate } from '../../lib/format';

const cap = (s) => s[0].toUpperCase() + s.slice(1).replace('_', ' ');
const SECTIONS = ['account', 'features', 'payments', 'webhooks'];
const SECTION_LABEL = { account: 'Account', features: 'Features', payments: 'Payments', webhooks: 'Webhooks' };

// Left pane: account selector and structured facts (REQ §12.2, §5.4).
export default function AccountPanel({ app, conv }) {
  const { state: s } = app;
  const account = s.accounts.find((a) => a.id === s.accountId);
  const latest = conv?.answers?.[conv.answers.length - 1];
  const facts = latest?.facts ?? s.accountFacts?.facts ?? [];
  const empty = latest?.empty ?? s.accountFacts?.empty ?? [];
  const asOf = latest?.asOf ?? s.accountFacts?.as_of;

  return (
    <section className="flex flex-col gap-5 overflow-auto border-r border-hairline bg-white p-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="account" className="eyebrow">ACCOUNT</label>
        <select
          id="account"
          value={s.accountId}
          disabled={!!conv}
          onChange={(e) => app.selectAccount(Number(e.target.value))}
          className="min-h-11 border-2 border-rule bg-white px-3 text-sm font-semibold disabled:bg-light-grey disabled:text-secondary"
        >
          {s.accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.companyName} · {a.ref} · {cap(a.plan)} · {cap(a.status)}</option>
          ))}
        </select>
        {!!account?.signals.length && (
          <div className="flex flex-wrap gap-1.5" title="About this account, not this question">
            {account.signals.map((signal) => <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>)}
          </div>
        )}
        {conv && <div className="text-xs leading-[1.45] text-muted">The account is fixed for this conversation. Start a new question to change it.</div>}
      </div>

      <div className="h-0.5 bg-black" />

      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">ACCOUNT FACTS</div>
        {asOf && <span className="font-mono text-xs text-muted">as of {fmtDate(asOf)}</span>}
      </div>

      {s.accountsError && <div className="border border-negative px-3 py-2 text-sm text-negative">{s.accountsError}</div>}
      {!s.accountFacts && !s.accountsError && <div className="text-sm text-muted">Loading account facts…</div>}

      {SECTIONS.map((sec) => (
        <div key={sec} className="flex flex-col gap-2">
          <div className="text-xs font-bold tracking-caps text-secondary">{SECTION_LABEL[sec].toUpperCase()}</div>
          {facts.filter((f) => f.section === sec).map((f) => (
            <div
              key={f.id}
              id={`fact-${f.id}`}
              className={`grid grid-cols-[34px_minmax(0,1fr)] gap-2 border-b border-hairline px-1 pb-2 text-sm transition-colors ${app.workspace.activeFact === f.id ? 'bg-supply-green-tint' : ''}`}
            >
              <span className="pt-px font-mono text-[11px] font-bold">{f.id}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-xs text-muted">{f.label}</span>
                <span className="font-semibold leading-[1.4]">{f.value}</span>
              </span>
            </div>
          ))}
          {empty.filter((e) => e.section === sec).map((e) => (
            <div key={e.note} className="border border-dashed border-rule px-3 py-2 text-sm text-secondary">{e.note}</div>
          ))}
        </div>
      ))}

      <div className="text-xs leading-[1.45] text-muted">
        Facts are computed from account records. Company name and references (A-…, PAY-…, WH-…) are not sent to the model.
      </div>
    </section>
  );
}
