import { ClipboardCheck, Inbox, Library } from 'lucide-react';
import { useSubPilot } from './hooks/useSubPilot';
import Sidebar from './components/Sidebar';
import DemoBanner from './components/DemoBanner';
import Toast from './components/ui/Toast';
import InboxView from './features/inbox/InboxView';
import WorkspaceView from './features/workspace/WorkspaceView';
import KnowledgeBaseView from './features/kb/KnowledgeBaseView';
import DocumentView from './features/kb/DocumentView';
import UploadDialog from './features/kb/UploadDialog';

// Demo knobs: simulateFailure (first generation fails), emptyLibrary, simSpeed ('Slow' | 'Normal' | 'Fast').
export default function App(props) {
  const app = useSubPilot(props);
  const { state: s, set } = app;
  const doc = s.docs.find((d) => d.id === s.selDoc);

  const nav = [
    { label: 'Inbox', icon: Inbox, count: s.qs.filter((q) => q.status !== 'Approved').length, active: ['inbox', 'workspace'].includes(s.view), onClick: () => set({ view: 'inbox' }) },
    { label: 'Knowledge base', icon: Library, count: s.docs.filter((d) => !d.archived).length, active: ['kb', 'doc'].includes(s.view), onClick: () => set({ view: 'kb' }) },
    { label: 'Evaluations', icon: ClipboardCheck, count: 'Next', disabled: true },
  ];

  return (
    <div className="grid h-screen min-w-[1280px] grid-cols-[224px_minmax(0,1fr)] bg-almost-white font-sans text-black">
      <Sidebar items={nav} user={{ name: app.reviewer, role: 'Support agent · Reviewer' }} />
      <main className="flex min-h-0 min-w-0 flex-col">
        <DemoBanner />
        {s.view === 'inbox' && <InboxView app={app} />}
        {s.view === 'workspace' && <WorkspaceView app={app} />}
        {s.view === 'kb' && <KnowledgeBaseView app={app} />}
        {s.view === 'doc' && doc && <DocumentView app={app} doc={doc} />}
      </main>
      <UploadDialog app={app} />
      {s.toast && <Toast {...s.toast} onClose={() => set({ toast: null })} />}
    </div>
  );
}
