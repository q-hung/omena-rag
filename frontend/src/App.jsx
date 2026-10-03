import { History, Library, MessageSquare } from 'lucide-react';
import { useJarvis } from './hooks/useJarvis';
import Sidebar from './components/Sidebar';
import DemoBanner from './components/DemoBanner';
import Toast from './components/ui/Toast';
import LoginView from './features/login/LoginView';
import KnowledgeBaseView from './features/kb/KnowledgeBaseView';
import DocumentView from './features/kb/DocumentView';
import UploadDialog from './features/kb/UploadDialog';
import WorkspaceView from './features/workspace/WorkspaceView';
import HistoryView from './features/history/HistoryView';

export default function App() {
  const app = useJarvis();
  const { state: s, set } = app;
  if (!s.signedIn) return <LoginView onSignIn={app.signIn} />;
  const doc = s.docs.find((d) => d.id === s.selDoc);

  const nav = [
    { label: 'Ask', icon: MessageSquare, count: '', active: s.view === 'ask', onClick: () => app.go('ask') },
    { label: 'History', icon: History, count: s.conversations.length, active: s.view === 'history', onClick: () => app.go('history') },
    { label: 'Knowledge base', icon: Library, count: s.docs.filter((d) => !d.archived).length, active: ['kb', 'doc'].includes(s.view), onClick: () => app.go('kb') },
  ];

  return (
    <div className="grid h-screen min-w-[1280px] grid-cols-[224px_minmax(0,1fr)] bg-almost-white font-sans text-black">
      <Sidebar items={nav} user={{ name: app.employee, role: 'Employee' }} onSignOut={app.signOut} />
      <main className="flex min-h-0 min-w-0 flex-col">
        <DemoBanner failNext={s.failNext} onToggleFail={() => set((st) => ({ failNext: !st.failNext }))} />
        {s.view === 'ask' && <WorkspaceView app={app} />}
        {s.view === 'history' && <HistoryView app={app} />}
        {s.view === 'kb' && <KnowledgeBaseView app={app} />}
        {s.view === 'doc' && doc && <DocumentView app={app} doc={doc} />}
      </main>
      <UploadDialog app={app} />
      {s.toast && <Toast {...s.toast} onClose={() => set({ toast: null })} />}
    </div>
  );
}
