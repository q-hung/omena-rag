import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { accountById } from '../../data/jarvis';
import { STATE_LABEL, STATE_TONE, deriveState } from '../../lib/model';
import AccountPanel from './AccountPanel';
import ConversationPanel from './ConversationPanel';

// Ask workspace: account | conversation | document evidence (REQ §12.2).
export default function WorkspaceView({ app }) {
  const { state: s } = app;
  const conv = s.conversations.find((c) => c.id === s.convId) || null;
  const account = accountById(s.accountId);
  const st = conv && deriveState(conv, !!s.generating[conv.id]);

  return (
    <>
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-hairline bg-white px-8">
        <h1 className="text-base font-bold">Ask</h1>
        <span className="h-5 w-px bg-rule" />
        <span className="whitespace-nowrap text-sm font-semibold">{account.company}</span>
        <span className="font-mono text-xs text-muted">{account.ref}</span>
        <span className="ml-auto" />
        {st && <Badge tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Badge>}
        {conv && <Button size="sm" variant="secondary" onClick={app.newQuestion}>New question</Button>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.9fr)_minmax(440px,1.6fr)_minmax(300px,1fr)]">
        <AccountPanel app={app} conv={conv} />
        <ConversationPanel app={app} conv={conv} account={account} state={st} />
        <section className="overflow-auto border-l border-hairline bg-white p-6 text-sm text-secondary">Document evidence (P08).</section>
      </div>
    </>
  );
}
