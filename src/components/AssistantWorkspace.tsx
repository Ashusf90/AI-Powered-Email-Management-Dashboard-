import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatFullDateTime,
  formatShortTime,
  getProviderLabel,
  getResponsibilityMeta,
} from '../lib/format';
import type {
  ConnectedAccount,
  EmailProvider,
  EmailSegment,
  EmailThread,
  Responsibility,
  UserSession,
} from '../types/email';
import { Avatar } from './Avatar';
import { ResponsibilityDonut } from './ResponsibilityDonut';

export type FilterKey =
  | 'all'
  | 'assistant'
  | 'client'
  | 'no_reply'
  | 'needs_review'
  | 'action_required'
  | 'waiting'
  | 'meetings'
  | 'important'
  | 'general'
  | 'archived_completed';

interface AssistantWorkspaceProps {
  session: UserSession;
  accounts: ConnectedAccount[];
  threads: EmailThread[];
  selectedThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  activeFilter: FilterKey;
  onChangeFilter: (key: FilterKey) => void;
  onUpdateThread: (
    threadId: string,
    payload: Partial<EmailThread> & { manualResponsibilityReason?: string }
  ) => Promise<void>;
  onAnalyzeThread: (threadId: string) => Promise<void>;
  onSimulateReply: (
    threadId: string,
    payload: { senderName?: string; senderEmail?: string; body: string }
  ) => Promise<void>;
  onDraftReply: (
    threadId: string,
    payload: {
      authorRole: 'assistant' | 'client';
      tone: 'concise' | 'warm' | 'formal';
      instruction?: string;
    }
  ) => Promise<{ subject: string; body: string; rationale: string }>;
  onSendReply: (
    threadId: string,
    payload: {
      body: string;
      authorRole: 'assistant' | 'client';
      markCompleted?: boolean;
    }
  ) => Promise<void>;
  onOpenConnectModal: () => void;
  onOpenSimulateModal: () => void;
  onOpenCopilot: () => void;
  onSyncAccount: (accountId: string) => Promise<void>;
}

export function AssistantWorkspace({
  session,
  accounts,
  threads,
  selectedThreadId,
  onSelectThread,
  activeFilter,
  onChangeFilter,
  onUpdateThread,
  onAnalyzeThread,
  onSimulateReply,
  onDraftReply,
  onSendReply,
  onOpenConnectModal,
  onOpenSimulateModal,
  onOpenCopilot,
  onSyncAccount,
}: AssistantWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | EmailProvider>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Thread action & AI composer states
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<'assistant' | 'client'>('assistant');
  const [draftTone, setDraftTone] = useState<'concise' | 'warm' | 'formal'>('concise');
  const [draftInstruction, setDraftInstruction] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftRationale, setDraftRationale] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Incoming reply simulator inside thread
  const [simReplyOpen, setSimReplyOpen] = useState(false);
  const [simReplyBody, setSimReplyBody] = useState('');
  const [simulatingReply, setSimulatingReply] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const activeThreads = useMemo(
    () => threads.filter((t) => !t.isArchived && !t.isCompleted),
    [threads]
  );

  // KPI Metrics
  const stats = useMemo(() => {
    return {
      totalActive: activeThreads.length,
      unread: activeThreads.filter((t) => t.isUnread).length,
      important: activeThreads.filter((t) => t.isImportant).length,
      assistant: activeThreads.filter(
        (t) => t.responsibility === 'ASSISTANT_TO_REPLY'
      ).length,
      client: activeThreads.filter((t) => t.responsibility === 'CLIENT_TO_REPLY')
        .length,
      noReply: activeThreads.filter((t) => t.responsibility === 'NO_REPLY_NEEDED')
        .length,
      needsReview: activeThreads.filter((t) => t.needsReview).length,
      actionRequired: activeThreads.filter((t) =>
        t.segments.includes('Action Required')
      ).length,
      waiting: activeThreads.filter((t) =>
        t.segments.includes('Waiting for Response')
      ).length,
      meetings: activeThreads.filter((t) =>
        t.segments.includes('Meetings & Appointments')
      ).length,
      general: activeThreads.filter((t) => t.segments.includes('General')).length,
      archivedCompleted: threads.filter((t) => t.isArchived || t.isCompleted)
        .length,
    };
  }, [activeThreads, threads]);

  // Extracted upcoming calendar items across active threads
  const upcomingDates = useMemo(() => {
    const items: Array<{
      threadId: string;
      title: string;
      dateLabel: string;
      timeLabel: string;
    }> = [];
    for (const t of activeThreads) {
      for (const d of t.extractedDates) {
        items.push({
          threadId: t.id,
          title: d.title,
          dateLabel: d.dateLabel,
          timeLabel: d.timeLabel,
        });
      }
    }
    return items.slice(0, 4);
  }, [activeThreads]);

  // Filtered threads list
  const filteredThreads = useMemo(() => {
    let list =
      activeFilter === 'archived_completed'
        ? threads.filter((t) => t.isArchived || t.isCompleted)
        : activeThreads;

    switch (activeFilter) {
      case 'assistant':
        list = list.filter((t) => t.responsibility === 'ASSISTANT_TO_REPLY');
        break;
      case 'client':
        list = list.filter((t) => t.responsibility === 'CLIENT_TO_REPLY');
        break;
      case 'no_reply':
        list = list.filter((t) => t.responsibility === 'NO_REPLY_NEEDED');
        break;
      case 'needs_review':
        list = list.filter((t) => t.needsReview);
        break;
      case 'action_required':
        list = list.filter((t) => t.segments.includes('Action Required'));
        break;
      case 'waiting':
        list = list.filter((t) => t.segments.includes('Waiting for Response'));
        break;
      case 'meetings':
        list = list.filter((t) =>
          t.segments.includes('Meetings & Appointments')
        );
        break;
      case 'important':
        list = list.filter(
          (t) => t.isImportant || t.segments.includes('Important')
        );
        break;
      case 'general':
        list = list.filter((t) => t.segments.includes('General'));
        break;
      default:
        break;
    }

    if (providerFilter !== 'all') {
      list = list.filter((t) => t.provider === providerFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.primarySenderName.toLowerCase().includes(q) ||
          t.primarySenderEmail.toLowerCase().includes(q) ||
          (t.primarySenderCompany?.toLowerCase().includes(q) ?? false) ||
          t.summary.toLowerCase().includes(q)
      );
    }

    return [...list].sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }, [activeFilter, activeThreads, providerFilter, searchQuery, threads]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const handleSelectThread = (thread: EmailThread) => {
    onSelectThread(thread.id);
    setDraftBody('');
    setDraftRationale(null);
    setComposerError(null);
    setSimReplyOpen(false);
    setSimReplyBody('');
    setDraftRole(
      thread.responsibility === 'CLIENT_TO_REPLY' ? 'client' : 'assistant'
    );
    if (thread.isUnread) {
      onUpdateThread(thread.id, { isUnread: false }).catch(() => {});
    }
  };

  const handleManualResponsibility = async (
    threadId: string,
    responsibility: Responsibility
  ) => {
    await onUpdateThread(threadId, { responsibility });
    const meta = getResponsibilityMeta(responsibility);
    showToast(`Reassigned to ${meta.label}`);
  };

  const handleReanalyze = async (threadId: string) => {
    setAnalyzingId(threadId);
    setComposerError(null);
    try {
      await onAnalyzeThread(threadId);
      showToast('Thread re-analyzed by Gemini AI.');
    } catch (err) {
      setComposerError(
        err instanceof Error ? err.message : 'AI analysis failed.'
      );
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedThread) return;
    setDrafting(true);
    setComposerError(null);
    try {
      const res = await onDraftReply(selectedThread.id, {
        authorRole: draftRole,
        tone: draftTone,
        instruction: draftInstruction.trim() || undefined,
      });
      setDraftBody(res.body);
      setDraftRationale(res.rationale);
    } catch (err) {
      setComposerError(
        err instanceof Error ? err.message : 'Failed to generate AI draft.'
      );
    } finally {
      setDrafting(false);
    }
  };

  const handleApproveAndSend = async (markCompleted: boolean) => {
    if (!selectedThread || !draftBody.trim()) return;
    setSending(true);
    setComposerError(null);
    try {
      await onSendReply(selectedThread.id, {
        body: draftBody,
        authorRole: draftRole,
        markCompleted,
      });
      setDraftBody('');
      setDraftRationale(null);
      setDraftInstruction('');
      showToast(
        markCompleted
          ? 'Reply sent and conversation marked completed.'
          : 'Reply sent — moved to Waiting for Response.'
      );
    } catch (err) {
      setComposerError(
        err instanceof Error ? err.message : 'Failed to send reply.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleSimulateThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !simReplyBody.trim()) return;
    setSimulatingReply(true);
    setComposerError(null);
    try {
      await onSimulateReply(selectedThread.id, {
        senderName: selectedThread.primarySenderName,
        senderEmail: selectedThread.primarySenderEmail,
        body: simReplyBody,
      });
      setSimReplyBody('');
      setSimReplyOpen(false);
      showToast(
        'Incoming reply received — AI automatically reconsidered responsibility.'
      );
    } catch (err) {
      setComposerError(
        err instanceof Error ? err.message : 'Failed to process simulated reply.'
      );
    } finally {
      setSimulatingReply(false);
    }
  };

  const responsibilityNav: Array<{
    key: FilterKey;
    label: string;
    count: number;
    icon: typeof Inbox;
    highlightColor?: string;
  }> = [
    { key: 'all', label: 'All Inbox', count: stats.totalActive, icon: Inbox },
    {
      key: 'assistant',
      label: 'Assistant to Reply',
      count: stats.assistant,
      icon: UserCheck,
      highlightColor: 'text-blue-700',
    },
    {
      key: 'client',
      label: 'Client to Reply',
      count: stats.client,
      icon: Users,
      highlightColor: 'text-amber-700',
    },
    {
      key: 'no_reply',
      label: 'No Reply Needed',
      count: stats.noReply,
      icon: CheckCircle2,
    },
    {
      key: 'needs_review',
      label: 'Needs Review',
      count: stats.needsReview,
      icon: AlertCircle,
      highlightColor: stats.needsReview > 0 ? 'text-red-600' : undefined,
    },
  ];

  const segmentNav: Array<{
    key: FilterKey;
    label: EmailSegment | 'Completed & Archived';
    count: number;
  }> = [
    { key: 'action_required', label: 'Action Required', count: stats.actionRequired },
    { key: 'waiting', label: 'Waiting for Response', count: stats.waiting },
    { key: 'meetings', label: 'Meetings & Appointments', count: stats.meetings },
    { key: 'important', label: 'Important', count: stats.important },
    { key: 'general', label: 'General', count: stats.general },
    {
      key: 'archived_completed',
      label: 'Completed & Archived',
      count: stats.archivedCompleted,
    },
  ];

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-6 flex-1 overflow-y-auto thin-scrollbar">
        {/* Responsibility Triage */}
        <div>
          <p className="px-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Reply Responsibility
          </p>
          <nav className="space-y-0.5">
            {responsibilityNav.map((item) => {
              const Icon = item.icon;
              const active = activeFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onChangeFilter(item.key);
                    setMobileFiltersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-blue-700' : item.highlightColor || 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="tabular-nums text-[11px] font-mono text-slate-500">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Smart Segments */}
        <div>
          <p className="px-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Smart Segments
          </p>
          <nav className="space-y-0.5">
            {segmentNav.map((seg) => {
              const active = activeFilter === seg.key;
              return (
                <button
                  key={seg.key}
                  type="button"
                  onClick={() => {
                    onChangeFilter(seg.key);
                    setMobileFiltersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">{seg.label}</span>
                  <span className="tabular-nums text-[11px] font-mono text-slate-400">
                    {seg.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Connected Accounts Summary */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between px-2.5 mb-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Connected Inboxes
            </p>
            <button
              type="button"
              onClick={onOpenConnectModal}
              aria-label="Connect new account"
              className="p-1 text-slate-500 hover:text-blue-700 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 px-2.5">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">
                    {acc.email}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {getProviderLabel(acc.provider)} ·{' '}
                    {acc.status === 'connected' ? 'Synced' : 'Disconnected'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSyncAccount(acc.id)}
                  title="Sync mailbox"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assistant Identity Footer */}
      <div className="p-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center gap-3">
        <Avatar
          name={session.assistantName}
          src="/src/assets/images/avatar_assistant_1794899104401.jpg"
          size="sm"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">
            {session.assistantName}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            Assisting {session.clientName}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-slate-50 overflow-hidden">
      {/* KPI Overview Strip, Responsibility Donut & Upcoming Dates */}
      <div className="bg-white border-b border-slate-200 shrink-0 flex flex-col lg:flex-row lg:items-stretch">
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-200">
            {[
              { label: 'Active Inbox', value: stats.totalActive, filter: 'all' as FilterKey },
              { label: 'Unread', value: stats.unread, filter: 'all' as FilterKey },
              {
                label: 'Assistant to Reply',
                value: stats.assistant,
                filter: 'assistant' as FilterKey,
                accent: 'text-blue-700',
              },
              {
                label: 'Client to Reply',
                value: stats.client,
                filter: 'client' as FilterKey,
                accent: 'text-amber-700',
              },
              {
                label: 'Waiting Reply',
                value: stats.waiting,
                filter: 'waiting' as FilterKey,
              },
              {
                label: 'Needs Review',
                value: stats.needsReview,
                filter: 'needs_review' as FilterKey,
                accent: stats.needsReview > 0 ? 'text-red-600' : undefined,
              },
            ].map((kpi) => (
              <button
                key={kpi.label}
                type="button"
                onClick={() => onChangeFilter(kpi.filter)}
                className={`px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                  activeFilter === kpi.filter && kpi.filter !== 'all'
                    ? 'bg-slate-50'
                    : ''
                }`}
              >
                <span className="block text-[11px] text-slate-500 truncate">
                  {kpi.label}
                </span>
                <span
                  className={`block font-mono text-lg font-semibold tabular-nums mt-0.5 ${
                    kpi.accent || 'text-slate-900'
                  }`}
                >
                  {kpi.value}
                </span>
              </button>
            ))}
          </div>

          {/* Upcoming Meetings & Deadlines Extracted by AI */}
          {upcomingDates.length > 0 && (
            <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-200 flex items-center gap-3 overflow-x-auto thin-scrollbar">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap shrink-0">
                <Calendar className="w-3.5 h-3.5 text-blue-700" />
                <span>Extracted Schedule:</span>
              </span>
              <div className="flex items-center gap-4">
                {upcomingDates.map((d, i) => (
                  <button
                    key={`${d.threadId}-${i}`}
                    type="button"
                    onClick={() => {
                      const t = threads.find((x) => x.id === d.threadId);
                      if (t) handleSelectThread(t);
                    }}
                    className="text-xs text-slate-700 hover:text-blue-700 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <span className="font-medium">{d.title}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {d.dateLabel}, {d.timeLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Email Responsibility Breakdown Donut Chart */}
        <div className="lg:w-[300px] xl:w-[330px] border-t lg:border-t-0 lg:border-l border-slate-200 shrink-0 flex items-center">
          <div className="w-full">
            <ResponsibilityDonut
              assistantCount={stats.assistant}
              clientCount={stats.client}
              noReplyCount={stats.noReply}
              activeFilter={activeFilter}
              onSelectFilter={(filterKey) => onChangeFilter(filterKey)}
            />
          </div>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 bg-white border-r border-slate-200 shrink-0">
          {SidebarContent}
        </aside>

        {/* Mobile Filter Drawer */}
        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div className="w-72 bg-white border-r border-slate-200 h-full shadow-xl">
              {SidebarContent}
            </div>
            <div
              className="flex-1 bg-slate-900/30"
              onClick={() => setMobileFiltersOpen(false)}
            />
          </div>
        )}

        {/* Thread List Column */}
        <section
          className={`${
            selectedThread ? 'hidden md:flex' : 'flex'
          } w-full md:w-[360px] xl:w-[410px] bg-white border-r border-slate-200 flex-col shrink-0 min-h-0`}
        >
          {/* Search + Controls */}
          <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                aria-label="Open segments menu"
                className="lg:hidden p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                <Filter className="w-4 h-4" />
              </button>
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sender, subject, or summary..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="button"
                onClick={onOpenSimulateModal}
                title="Simulate incoming email to test live AI classification"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simulate</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                {(['all', 'gmail', 'outlook'] as const).map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => setProviderFilter(prov)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                      providerFilter === prov
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {prov === 'all'
                      ? 'All Accounts'
                      : prov === 'gmail'
                        ? 'Gmail'
                        : 'Outlook'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {filteredThreads.length} shown
              </span>
            </div>
          </div>

          {/* Thread Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-200 thin-scrollbar">
            {filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Mail className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-800">
                  No conversations match this filter
                </p>
                <p className="text-xs text-slate-500">
                  Clear search or switch segments to view other emails.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setProviderFilter('all');
                    onChangeFilter('all');
                  }}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-700 hover:underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.id === selectedThreadId;
                const resp = getResponsibilityMeta(thread.responsibility);
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleSelectThread(thread)}
                    className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-slate-50 ${
                      isSelected ? 'bg-blue-50/50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {thread.isUnread && (
                          <span
                            aria-label="Unread"
                            className="w-2 h-2 rounded-full bg-blue-700 shrink-0"
                          />
                        )}
                        <span
                          className={`text-xs truncate ${
                            thread.isUnread
                              ? 'font-semibold text-slate-950'
                              : 'font-medium text-slate-800'
                          }`}
                        >
                          {thread.primarySenderName}
                        </span>
                        {thread.primarySenderCompany && (
                          <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                            · {thread.primarySenderCompany}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {thread.isImportant && (
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        )}
                        <time className="text-[11px] font-mono text-slate-500 tabular-nums">
                          {formatShortTime(thread.lastMessageAt)}
                        </time>
                      </div>
                    </div>

                    <p
                      className={`text-sm mt-1 truncate ${
                        thread.isUnread
                          ? 'font-semibold text-slate-900'
                          : 'font-medium text-slate-800'
                      }`}
                    >
                      {thread.subject}
                    </p>

                    <p className="text-xs text-slate-500 line-clamp-1 mt-1">
                      {thread.summary}
                    </p>

                    {/* Clean Unboxed Metadata Row — Zero Pill Enclosures */}
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] truncate">
                      <span className={`font-semibold ${resp.textColor}`}>
                        {resp.label}
                      </span>
                      {thread.needsReview && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-semibold text-red-600">
                            Needs Review
                          </span>
                        </>
                      )}
                      {thread.segments[0] && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500">
                            {thread.segments[0]}
                          </span>
                        </>
                      )}
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">
                        {getProviderLabel(thread.provider)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Thread Detail & AI Action Pane */}
        <section
          className={`${
            selectedThread ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col bg-slate-50 min-w-0 min-h-0`}
        >
          {!selectedThread ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <Inbox className="w-8 h-8 text-slate-300" />
              <div className="space-y-1">
                <h2 className="font-display text-base font-semibold text-slate-800">
                  Select a conversation to review
                </h2>
                <p className="text-xs text-slate-500 max-w-sm">
                  View full message history, verify AI reply responsibility, or
                  generate a draft reply with Gemini.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Detail Header Toolbar */}
              <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectThread(null)}
                    className="md:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-lg"
                    aria-label="Back to inbox list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-slate-900 truncate">
                      {selectedThread.subject}
                    </h2>
                    <p className="text-xs text-slate-500 truncate">
                      {getProviderLabel(selectedThread.provider)} ·{' '}
                      {selectedThread.messages.length}{' '}
                      {selectedThread.messages.length === 1 ? 'message' : 'messages'}
                      {selectedThread.isCompleted ? ' · Completed' : ''}
                      {selectedThread.isArchived ? ' · Archived' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateThread(selectedThread.id, {
                        isUnread: !selectedThread.isUnread,
                      })
                    }
                    title={
                      selectedThread.isUnread ? 'Mark as read' : 'Mark as unread'
                    }
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <MailOpen className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateThread(selectedThread.id, {
                        isImportant: !selectedThread.isImportant,
                      })
                    }
                    title="Toggle important"
                    className="p-2 text-slate-600 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        selectedThread.isImportant
                          ? 'text-amber-500 fill-amber-500'
                          : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateThread(selectedThread.id, {
                        isCompleted: !selectedThread.isCompleted,
                      });
                      showToast(
                        selectedThread.isCompleted
                          ? 'Conversation reopened.'
                          : 'Marked as completed.'
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="hidden sm:inline">
                      {selectedThread.isCompleted ? 'Reopen' : 'Complete'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateThread(selectedThread.id, {
                        isArchived: !selectedThread.isArchived,
                      });
                      showToast(
                        selectedThread.isArchived
                          ? 'Restored to inbox.'
                          : 'Conversation archived.'
                      );
                    }}
                    title="Archive conversation"
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Detail Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 thin-scrollbar">
                {toastMsg && (
                  <div
                    role="status"
                    className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800"
                  >
                    {toastMsg}
                  </div>
                )}

                {/* AI Responsibility & Triage Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-semibold ${
                            getResponsibilityMeta(selectedThread.responsibility)
                              .textColor
                          }`}
                        >
                          {
                            getResponsibilityMeta(selectedThread.responsibility)
                              .label
                          }
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          {selectedThread.responsibilityLockedByHuman
                            ? 'Manual override'
                            : `${Math.round(selectedThread.confidence * 100)}% AI confidence`}
                        </span>
                        {selectedThread.needsReview && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-semibold text-red-600">
                              Flagged for Assistant Review
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {selectedThread.responsibilityReason}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={analyzingId === selectedThread.id}
                      onClick={() => handleReanalyze(selectedThread.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
                    >
                      {analyzingId === selectedThread.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                      )}
                      <span>Re-analyze with AI</span>
                    </button>
                  </div>

                  {/* Manual Reassignment Segmented Control */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-500">
                      Assign Reply Responsibility:
                    </span>
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(
                        [
                          { id: 'ASSISTANT_TO_REPLY', label: 'Assistant' },
                          { id: 'CLIENT_TO_REPLY', label: 'Client' },
                          { id: 'NO_REPLY_NEEDED', label: 'No Reply' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            handleManualResponsibility(selectedThread.id, opt.id)
                          }
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            selectedThread.responsibility === opt.id
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedThread.clientDelegationNote && (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900">
                      <span className="font-semibold">
                        Client instruction from {session.clientName}:
                      </span>{' '}
                      “{selectedThread.clientDelegationNote}”
                    </div>
                  )}
                </div>

                {/* AI Summary + Highlights + Dates */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900">
                      AI Executive Summary & Key Details
                    </h3>
                    <button
                      type="button"
                      onClick={onOpenCopilot}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Ask AI about this thread
                    </button>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed">
                    {selectedThread.summary}
                  </p>

                  {selectedThread.importantHighlights.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {selectedThread.importantHighlights.map((hl, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-600 flex items-start gap-2"
                        >
                          <span className="text-slate-400 select-none">•</span>
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {selectedThread.extractedDates.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-4">
                      {selectedThread.extractedDates.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs text-slate-700"
                        >
                          <Clock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                          <span className="font-medium">{d.title}:</span>
                          <span className="font-mono text-[11px] tabular-nums text-slate-600">
                            {d.dateLabel} · {d.timeLabel}
                            {d.locationOrLink ? ` (${d.locationOrLink})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Conversation History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Conversation History
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSimReplyOpen(!simReplyOpen)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>Simulate Incoming Reply</span>
                    </button>
                  </div>

                  {simReplyOpen && (
                    <form
                      onSubmit={handleSimulateThreadReply}
                      className="bg-white border border-blue-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-900">
                          Simulate new message from {selectedThread.primarySenderName}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setSimReplyBody(
                              `Actually, could ${session.assistantName.split(' ')[0]} go ahead and lock Friday morning at 9:30 AM PT on the calendar and send the Zoom invite? No need to wait on Elena.`
                            )
                          }
                          className="text-[11px] font-medium text-blue-700 hover:underline"
                        >
                          Fill sample reply
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={simReplyBody}
                        onChange={(e) => setSimReplyBody(e.target.value)}
                        placeholder="Type an incoming reply to test how Gemini re-evaluates responsibility..."
                        required
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSimReplyOpen(false)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={simulatingReply}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg"
                        >
                          {simulatingReply && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          <span>Deliver & Auto-Reclassify</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {selectedThread.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            name={msg.senderName}
                            src={
                              msg.senderAvatar ||
                              (msg.senderEmail ===
                              selectedThread.primarySenderEmail
                                ? selectedThread.primarySenderAvatar
                                : undefined)
                            }
                            size="md"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-900">
                                {msg.senderName}
                              </span>
                              {msg.sentByRole && (
                                <span className="text-[11px] text-blue-700 font-medium">
                                  ·{' '}
                                  {msg.sentByRole === 'assistant'
                                    ? 'Sent by Assistant'
                                    : 'Sent by Client'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {msg.senderEmail} → {msg.recipientEmail}
                            </p>
                          </div>
                        </div>
                        <time className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                          {formatFullDateTime(msg.sentAt)}
                        </time>
                      </div>

                      <div className="text-sm text-slate-800 whitespace-pre-line leading-relaxed pl-0 sm:pl-12">
                        {msg.body}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply Preparation & Approval Composer */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Prepare & Review Reply
                      </h3>
                      <p className="text-xs text-slate-500">
                        AI drafts require your review and explicit approval before
                        sending.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setDraftRole('assistant')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          draftRole === 'assistant'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        As {session.assistantName.split(' ')[0]} (PA)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftRole('client')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          draftRole === 'client'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        As {session.clientName.split(' ')[0]} (Client)
                      </button>
                    </div>
                  </div>

                  {/* AI Draft Controls */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <select
                      value={draftTone}
                      onChange={(e) =>
                        setDraftTone(
                          e.target.value as 'concise' | 'warm' | 'formal'
                        )
                      }
                      aria-label="Draft tone"
                      className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="concise">Tone: Concise</option>
                      <option value="warm">Tone: Warm</option>
                      <option value="formal">Tone: Formal</option>
                    </select>
                    <input
                      type="text"
                      value={draftInstruction}
                      onChange={(e) => setDraftInstruction(e.target.value)}
                      placeholder="Optional guidance (e.g., Propose Friday 9:30 AM PT)..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      disabled={drafting}
                      onClick={handleGenerateDraft}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      {drafting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{drafting ? 'Drafting...' : 'Draft with AI'}</span>
                    </button>
                  </div>

                  {draftRationale && (
                    <p className="text-xs text-slate-500">
                      AI Draft Note: {draftRationale}
                    </p>
                  )}

                  {composerError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      {composerError}
                    </div>
                  )}

                  <textarea
                    rows={6}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder={`Write a reply to ${selectedThread.primarySenderName} or click "Draft with AI"...`}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      To: {selectedThread.primarySenderEmail}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={sending || !draftBody.trim()}
                        onClick={() => handleApproveAndSend(false)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Approve & Send</span>
                      </button>
                      <button
                        type="button"
                        disabled={sending || !draftBody.trim()}
                        onClick={() => handleApproveAndSend(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                      >
                        {sending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Send & Mark Completed</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
