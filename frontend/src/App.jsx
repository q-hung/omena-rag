import { useEffect, useState } from 'react';
import { History, Library, MessageSquare } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAccounts } from './hooks/useAccounts';
import { useAsk } from './hooks/useAsk';
import { useDocuments } from './hooks/useDocuments';
import { useHistory } from './hooks/useHistory';
import { useSession } from './hooks/useSession';
import { useToast } from './hooks/useToast';
import Sidebar from './components/Sidebar';
import DemoBanner from './components/DemoBanner';
import Toast from './components/ui/Toast';
import LoginView from './features/login/LoginView';
import KnowledgeBaseView from './features/kb/KnowledgeBaseView';
import DocumentView from './features/kb/DocumentView';
import UploadDialog from './features/kb/UploadDialog';
import WorkspaceView from './features/workspace/WorkspaceView';
import HistoryView from './features/history/HistoryView';
import HistoryReadView from './features/history/HistoryReadView';

export default function App() {
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}

function Root() {
  const { session, signIn, signOut } = useSession();
  const location = useLocation();
  if (session === undefined) return null;

  if (!session) {
    return location.pathname === '/login'
      ? <LoginView onSignIn={signIn} />
      : <Navigate to="/login" replace />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/ask" replace />} />
      <Route path="*" element={<Shell session={session} onSignOut={signOut} />} />
    </Routes>
  );
}

function Shell({ session, onSignOut }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toasts = useToast();
  const accounts = useAccounts();
  const kb = useDocuments({ onToast: toasts.show });
  const history = useHistory();
  const workspace = useAsk({ accountId: accounts.accountId, onToast: toasts.show, onChange: history.refresh });
  const [selDocV, setSelDocV] = useState(null);

  const app = {
    accounts: accounts.accounts,
    accountId: accounts.accountId,
    accountFacts: accounts.accountFacts,
    accountsError: accounts.accountsError,
    selectAccount: (id) => {
      accounts.selectAccount(id);
      workspace.newQuestion();
    },
    state: {
      accountId: accounts.accountId,
      accounts: accounts.accounts,
      accountFacts: accounts.accountFacts,
      accountsError: accounts.accountsError,
      selDocV,
    },
    set: (patch) => {
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'selDocV')) setSelDocV(patch.selDocV);
    },
    kb,
    workspace,
    history,
    simulated: session.simulated,
    toast: toasts.show,
    go: (view) => { workspace.newQuestion(); navigate(`/${view}`); },
    openDoc: (id, v) => { setSelDocV(v ?? null); navigate(`/kb/${id}`); },
    onDeleted: () => { if (pathname.startsWith('/kb/')) navigate('/kb'); },
  };

  const section = pathname.split('/')[1];
  const nav = [
    { label: 'Ask', icon: MessageSquare, count: '', active: section === 'ask', onClick: () => app.go('ask') },
    { label: 'History', icon: History, count: history.rows.length || '', active: section === 'history', onClick: () => app.go('history') },
    { label: 'Knowledge base', icon: Library, count: kb.navCount, active: section === 'kb', onClick: () => app.go('kb') },
  ];

  const signOut = async () => { await onSignOut(); navigate('/login'); };

  return (
    <div className="grid h-screen min-w-[1280px] grid-cols-[224px_minmax(0,1fr)] bg-almost-white font-sans text-black">
      <Sidebar items={nav} user={{ name: session.employee.name, role: 'Employee' }} onSignOut={signOut} />
      <main className="flex min-h-0 min-w-0 flex-col">
        {session.simulated && <DemoBanner />}
        <Routes>
          <Route path="/ask" element={<WorkspaceView app={app} />} />
          <Route path="/history" element={<HistoryView app={app} />} />
          <Route path="/history/:id" element={<HistoryReadView app={app} />} />
          <Route path="/kb" element={<KnowledgeBaseView app={app} />} />
          <Route path="/kb/:id" element={<KbDocument app={app} />} />
          <Route path="*" element={<Navigate to="/ask" replace />} />
        </Routes>
      </main>
      <UploadDialog app={app} />
      {toasts.toast && <Toast {...toasts.toast} onClose={() => toasts.setToast(null)} />}
    </div>
  );
}

function KbDocument({ app }) {
  const { id } = useParams();
  const { detail, load } = app.kb;
  useEffect(() => {
    let active = true;
    load(id).catch(() => { if (active) app.go('kb'); });
    return () => { active = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!detail || String(detail.id) !== String(id)) return null;
  return <DocumentView app={app} doc={detail} />;
}
