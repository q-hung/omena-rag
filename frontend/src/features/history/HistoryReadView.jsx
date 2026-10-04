import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { api } from '../../lib/api';
import { STATE_LABEL, STATE_TONE } from '../../lib/model';
import AccountPanel from '../workspace/AccountPanel';
import ConversationPanel from '../workspace/ConversationPanel';
import EvidencePanel from '../workspace/EvidencePanel';

export default function HistoryReadView({ app }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conv, setConv] = useState(null);
  const [activeCite, setActiveCite] = useState(null);
  const [activeFact, setActiveFact] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setConv(null);
    setMissing(false);
    api(`/conversations/${id}`)
      .then((row) => {
        if (!active) {
          return;
        }
        if (row.ownedByMe) {
          app.selectAccount(row.accountId);
          app.workspace.open(row.id);
          navigate('/ask', { replace: true });
          return;
        }
        setConv(row);
      })
      .catch(() => {
        if (active) {
          setMissing(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return <Navigate to="/history" replace />;
  }
  if (!conv) {
    return null;
  }

  const account = app.accounts.find((a) => a.id === conv.accountId);
  const workspace = {
    ...app.workspace,
    conv,
    activeCite,
    setActiveCite,
    activeFact,
    setActiveFact,
    generating: false,
    ack: false,
    editing: false,
  };
  const view = { ...app, workspace, toast: app.toast };

  return (
    <>
      <div className="flex h-[60px] flex-none items-center gap-4 border-b border-hairline bg-white px-8">
        <h1 className="text-base font-bold">History</h1>
        <span className="h-5 w-px bg-rule" />
        <span className="whitespace-nowrap text-sm font-semibold">{account?.companyName}</span>
        <span className="font-mono text-xs text-muted">{account?.ref}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {(conv.topics ?? []).map((topic) => (
            <Badge key={topic} tone="outline">{topic}</Badge>
          ))}
        </span>
        <span className="ml-auto" />
        <Badge tone={STATE_TONE[conv.state]}>{STATE_LABEL[conv.state]}</Badge>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.9fr)_minmax(440px,1.6fr)_minmax(300px,1fr)]">
        <AccountPanel app={view} conv={conv} />
        <ConversationPanel app={view} conv={conv} account={account} state={conv.state} readOnly />
        <EvidencePanel app={view} conv={conv} state={conv.state} />
      </div>
    </>
  );
}
