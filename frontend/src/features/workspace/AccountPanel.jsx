import { SECTION_LABEL, accountById, accounts, factsFor } from '../../data/jarvis';
import { fmtDate } from '../../lib/format';

const cap = (s) => s[0].toUpperCase() + s.slice(1).replace('_', ' ');
const SECTIONS = ['account', 'features', 'payments', 'webhooks'];

// Left pane: account selector and structured facts (REQ §12.2, §5.4).
export default function AccountPanel({ app, conv }) {
  const { state: s } = app;
  const { asOf, facts, empty } = factsFor(accountById(s.accountId));

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
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.company} · {a.ref} · {cap(a.plan)} · {cap(a.status)}</option>
          ))}
        </select>
        {conv && <div className="text-xs leading-[1.45] text-muted">The account is fixed for this conversation. Start a new question to change it.</div>}
      </div>

      <div className="h-0.5 bg-black" />

      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">ACCOUNT FACTS</div>
        <span className="font-mono text-xs text-muted">as of {fmtDate(asOf)}</span>
      </div>

      {SECTIONS.map((sec) => (
        <div key={sec} className="flex flex-col gap-2">
          <div className="text-xs font-bold tracking-caps text-secondary">{SECTION_LABEL[sec].toUpperCase()}</div>
          {facts.filter((f) => f.section === sec).map((f) => (
            <div
              key={f.id}
              id={`fact-${f.id}`}
              className={`grid grid-cols-[34px_minmax(0,1fr)] gap-2 border-b border-hairline px-1 pb-2 text-sm transition-colors ${s.activeFact === f.id ? 'bg-supply-green-tint' : ''}`}
            >
              <span className="pt-px font-mono text-[11px] font-bold">{f.id}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-xs text-muted">{f.label}{f.ref ? ` · ${f.ref}` : ''}</span>
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
