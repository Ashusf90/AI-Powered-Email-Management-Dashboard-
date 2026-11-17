import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AccountsView } from './components/AccountsView';
import {
  AssistantWorkspace,
  type FilterKey,
} from './components/AssistantWorkspace';
import { ClientBriefView } from './components/ClientBriefView';
import { ConnectAccountModal } from './components/ConnectAccountModal';
import { CopilotDrawer } from './components/CopilotDrawer';
import { OnboardingFlow } from './components/OnboardingFlow';
import { SimulateEmailModal } from './components/SimulateEmailModal';
import { SpatialInbox3D } from './components/SpatialInbox3D';
import { api } from './lib/api';
import type { EmailProvider, EmailThread, WorkspaceState } from './types/email';

type ActiveView = 'assistant' | 'client' | 'spatial' | 'accounts';

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('assistant');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>('thr-101');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [simulateModalOpen, setSimulateModalOpen] = useState(false);

  const loadWorkspace = async () => {
    try {
      const data = await api.getWorkspace();
      setWorkspace(data);
      setShowOnboarding(!data.session.onboardingCompleted);
      if (!selectedThreadId && data.threads.length > 0) {
        setSelectedThreadId(data.threads[0].id);
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load workspace.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
          <span>Loading RelayDesk workspace...</span>
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            Workspace connection error
          </p>
          <p className="text-xs text-slate-600">{error}</p>
          <button
            type="button"
            onClick={loadWorkspace}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingFlow
        session={workspace.session}
        accounts={workspace.accounts}
        onLogin={async (payload) => {
          const updated = await api.login(payload);
          setWorkspace(updated);
        }}
        onConnectAccount={async (payload) => {
          const updated = await api.connectAccount(payload);
          setWorkspace(updated);
        }}
        onComplete={async () => {
          const updated = await api.completeOnboarding();
          setWorkspace(updated);
          setShowOnboarding(false);
        }}
      />
    );
  }

  const clientAttentionCount = workspace.threads.filter(
    (t) => !t.isArchived && !t.isCompleted && t.responsibility === 'CLIENT_TO_REPLY'
  ).length;

  const activeThread = workspace.threads.find((t) => t.id === selectedThreadId);

  const handleUpdateThread = async (
    threadId: string,
    payload: Partial<EmailThread> & { manualResponsibilityReason?: string }
  ) => {
    const res = await api.updateThread(threadId, payload);
    setWorkspace(res.workspace);
  };

  const handleAnalyzeThread = async (threadId: string) => {
    const res = await api.analyzeThread(threadId);
    setWorkspace(res.workspace);
  };

  const handleSimulateReply = async (
    threadId: string,
    payload: { senderName?: string; senderEmail?: string; body: string }
  ) => {
    const res = await api.simulateReply(threadId, payload);
    setWorkspace(res.workspace);
  };

  const handleSimulateIncomingEmail = async (payload: {
    senderName: string;
    senderEmail: string;
    senderCompany: string;
    subject: string;
    body: string;
    provider: EmailProvider;
  }) => {
    const res = await api.simulateIncomingEmail(payload);
    setWorkspace(res.workspace);
    setActiveFilter('all');
    setSelectedThreadId(res.thread.id);
    setActiveView('assistant');
  };

  const handleSendReply = async (
    threadId: string,
    payload: {
      body: string;
      authorRole: 'assistant' | 'client';
      markCompleted?: boolean;
    }
  ) => {
    const res = await api.sendReply(threadId, payload);
    setWorkspace(res.workspace);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveView('assistant')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          RelayDesk
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Workspace Views"
          className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setActiveView('assistant')}
            className={`h-14 inline-flex items-center text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'assistant'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Assistant Inbox
          </button>

          <button
            type="button"
            onClick={() => setActiveView('client')}
            className={`h-14 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'client'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Client Brief</span>
            <span className="font-mono text-xs text-amber-700 tabular-nums">
              ({clientAttentionCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('spatial')}
            className={`h-14 inline-flex items-center text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'spatial'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Spatial 3D
          </button>

          <button
            type="button"
            onClick={() => setActiveView('accounts')}
            className={`h-14 inline-flex items-center text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'accounts'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Accounts
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setCopilotOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ask AI Assistant</span>
            <span className="sm:hidden">Ask AI</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0">
        {activeView === 'assistant' && (
          <AssistantWorkspace
            session={workspace.session}
            accounts={workspace.accounts}
            threads={workspace.threads}
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
            activeFilter={activeFilter}
            onChangeFilter={setActiveFilter}
            onUpdateThread={handleUpdateThread}
            onAnalyzeThread={handleAnalyzeThread}
            onSimulateReply={handleSimulateReply}
            onDraftReply={(threadId, payload) =>
              api.draftReply(threadId, payload)
            }
            onSendReply={handleSendReply}
            onOpenConnectModal={() => setConnectModalOpen(true)}
            onOpenSimulateModal={() => setSimulateModalOpen(true)}
            onOpenCopilot={() => setCopilotOpen(true)}
            onSyncAccount={async (accountId) => {
              const updated = await api.syncAccount(accountId);
              setWorkspace(updated);
            }}
          />
        )}

        {activeView === 'client' && (
          <ClientBriefView
            session={workspace.session}
            threads={workspace.threads}
            onDelegateToAssistant={async (threadId, note) => {
              await handleUpdateThread(threadId, {
                responsibility: 'ASSISTANT_TO_REPLY',
                clientDelegationNote: note || 'Please handle this on my behalf.',
              });
            }}
            onMarkHandled={async (threadId) => {
              await handleUpdateThread(threadId, { isCompleted: true });
            }}
            onGenerateClientDraft={async (threadId) => {
              const draft = await api.draftReply(threadId, {
                authorRole: 'client',
                tone: 'concise',
              });
              return draft.body;
            }}
            onSendClientReply={async (threadId, body) => {
              await handleSendReply(threadId, {
                body,
                authorRole: 'client',
                markCompleted: true,
              });
            }}
          />
        )}

        {activeView === 'spatial' && (
          <SpatialInbox3D
            threads={workspace.threads}
            onOpenInInbox={(threadId) => {
              setSelectedThreadId(threadId);
              setActiveView('assistant');
            }}
          />
        )}

        {activeView === 'accounts' && (
          <AccountsView
            session={workspace.session}
            accounts={workspace.accounts}
            onConnectAccount={async (payload) => {
              const updated = await api.connectAccount(payload);
              setWorkspace(updated);
            }}
            onSyncAccount={async (accountId) => {
              const updated = await api.syncAccount(accountId);
              setWorkspace(updated);
            }}
            onDisconnectAccount={async (accountId) => {
              const updated = await api.disconnectAccount(accountId);
              setWorkspace(updated);
            }}
            onResetDemo={async () => {
              const updated = await api.resetWorkspace();
              setWorkspace(updated);
              setSelectedThreadId('thr-101');
              setActiveFilter('all');
            }}
            onOpenOnboarding={() => setShowOnboarding(true)}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        activeThreadId={selectedThreadId ?? undefined}
        activeThreadSubject={activeThread?.subject}
        onSelectThread={(id) => {
          setSelectedThreadId(id);
          setActiveView('assistant');
        }}
        onApplyFilter={(filterKey) => {
          setActiveFilter(filterKey as FilterKey);
          setActiveView('assistant');
        }}
      />

      <ConnectAccountModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        onConnect={async (payload) => {
          const updated = await api.connectAccount(payload);
          setWorkspace(updated);
        }}
        defaultClientName={workspace.session.clientName}
      />

      <SimulateEmailModal
        isOpen={simulateModalOpen}
        onClose={() => setSimulateModalOpen(false)}
        onSubmit={handleSimulateIncomingEmail}
      />
    </div>
  );
}
