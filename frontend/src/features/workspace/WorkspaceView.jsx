import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { STATE_LABEL, STATE_TONE } from '../../lib/model';
import AccountPanel from './AccountPanel';
import ConversationPanel from './ConversationPanel';
import EvidencePanel from './EvidencePanel';

// Ask workspace: account | conversation | document evidence (REQ §12.2).
export default function WorkspaceView({ app }) {
  const { state: s, workspace: w } = app;
  const conv = w.conv;
  const account = s.accounts.find((a) => a.id === s.accountId);
  const st = w.generating ? 'generating' : conv?.state;

  if (!account) return null;

  return (
    <>
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-hairline bg-white px-8">
        <h1 className="text-base font-bold">Ask</h1>
        <span className="h-5 w-px bg-rule" />
        <span className="whitespace-nowrap text-sm font-semibold">{account.companyName}</span>
        <span className="font-mono text-xs text-muted">{account.ref}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {(account.signals ?? []).map((signal) => (
            <Badge key={signal.key} tone={signal.tone}>{signal.label}</Badge>
          ))}
          {(conv?.topics ?? []).map((topic) => (
            <Badge key={topic} tone="outline">{topic}</Badge>
          ))}
        </span>
        <span className="ml-auto" />
        {st && <Badge tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Badge>}
        {conv && <Button size="sm" variant="secondary" onClick={w.newQuestion}>New question</Button>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.9fr)_minmax(440px,1.6fr)_minmax(300px,1fr)]">
        <AccountPanel app={app} conv={conv} />
        <ConversationPanel app={app} conv={conv} account={account} state={st} />
        <EvidencePanel app={app} conv={conv} state={st} />
      </div>
    </>
  );
}
