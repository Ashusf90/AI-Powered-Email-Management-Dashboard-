import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MailCheck,
  Send,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { formatFullDateTime, formatShortTime, getProviderLabel } from '../lib/format';
import type { EmailThread, UserSession } from '../types/email';
import { Avatar } from './Avatar';

interface ClientBriefViewProps {
  session: UserSession;
  threads: EmailThread[];
  onDelegateToAssistant: (threadId: string, note: string) => Promise<void>;
  onMarkHandled: (threadId: string) => Promise<void>;
  onSendClientReply: (threadId: string, body: string) => Promise<void>;
  onGenerateClientDraft: (threadId: string) => Promise<string>;
}

export function ClientBriefView({
  session,
  threads,
  onDelegateToAssistant,
  onMarkHandled,
  onSendClientReply,
  onGenerateClientDraft,
}: ClientBriefViewProps) {
  const [showHandled, setShowHandled] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [delegationNote, setDelegationNote] = useState('');
  const [replyTextByThread, setReplyTextByThread] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const clientAttentionThreads = threads.filter(
    (t) =>
      !t.isArchived &&
      !t.isCompleted &&
      t.responsibility === 'CLIENT_TO_REPLY'
  );

  const recentlyHandledOrDelegated = threads.filter(
    (t) =>
      !t.isArchived &&
      (t.isCompleted || Boolean(t.clientDelegationNote))
  );

  const displayedThreads = showHandled
    ? recentlyHandledOrDelegated
    : clientAttentionThreads;

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleDelegateSubmit = async (threadId: string) => {
    setBusyId(threadId);
    try {
      await onDelegateToAssistant(threadId, delegationNote.trim());
      setDelegateId(null);
      setDelegationNote('');
      notify(`Handed off to ${session.assistantName} — synced to Assistant Inbox.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkDone = async (threadId: string) => {
    setBusyId(threadId);
    try {
      await onMarkHandled(threadId);
      notify('Marked as handled and updated in Assistant Inbox.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDraftForClient = async (threadId: string) => {
    setDraftingId(threadId);
    try {
      const body = await onGenerateClientDraft(threadId);
      setReplyTextByThread((prev) => ({ ...prev, [threadId]: body }));
    } finally {
      setDraftingId(null);
    }
  };

  const handleSendReply = async (threadId: string) => {
    const body = replyTextByThread[threadId]?.trim();
    if (!body) return;
    setBusyId(threadId);
    try {
      await onSendClientReply(threadId, body);
      setReplyTextByThread((prev) => ({ ...prev, [threadId]: '' }));
      setExpandedId(null);
      notify('Your personal reply was sent and logged.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Minimalistic Executive Header */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <Avatar
              name={session.clientName}
              src="/src/assets/images/avatar_client_1794899104143.jpg"
              size="lg"
            />
            <div>
              <p className="text-xs font-medium text-slate-500">
                Client Executive Brief · Managed by {session.assistantName}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 mt-0.5">
                {clientAttentionThreads.length === 0
                  ? 'Nothing needs your reply right now'
                  : `${clientAttentionThreads.length} ${clientAttentionThreads.length === 1 ? 'decision' : 'decisions'} awaiting your input`}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowHandled(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                !showHandled
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Needs My Reply ({clientAttentionThreads.length})
            </button>
            <button
              type="button"
              onClick={() => setShowHandled(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                showHandled
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Handled ({recentlyHandledOrDelegated.length})
            </button>
          </div>
        </header>

        {feedback && (
          <div
            role="status"
            className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800 flex items-center gap-2"
          >
            <MailCheck className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Clean Empty State */}
        {displayedThreads.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
            <Check className="w-7 h-7 text-emerald-700 mx-auto" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              {showHandled ? 'No handled items yet' : 'Your personal queue is clear'}
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {showHandled
                ? 'Conversations you complete or hand back to your assistant will appear here.'
                : `${session.assistantName} is handling scheduling, travel, and routine correspondence.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedThreads.map((thread) => {
              const isExpanded = expandedId === thread.id;
              const isDelegating = delegateId === thread.id;
              const isBusy = busyId === thread.id;

              return (
                <article
                  key={thread.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  {/* Quiet metadata kicker — zero pill boxes */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900">
                        {thread.primarySenderName}
                      </span>
                      {thread.primarySenderCompany && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{thread.primarySenderCompany}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{getProviderLabel(thread.provider)}</span>
                    </div>
                    <time className="tabular-nums shrink-0">
                      {formatShortTime(thread.lastMessageAt)}
                    </time>
                  </div>

                  {/* Subject */}
                  <h2 className="font-display text-lg font-semibold text-slate-900 leading-snug">
                    {thread.subject}
                  </h2>

                  {/* AI Summary */}
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {thread.summary}
                  </p>

                  {/* Why Client's Response is Needed */}
                  {!showHandled && (
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1">
                      <p className="text-xs font-semibold text-amber-800">
                        Why your response is needed
                      </p>
                      <p className="text-sm text-amber-950 leading-relaxed">
                        {thread.clientActionWhy || thread.responsibilityReason}
                      </p>
                    </div>
                  )}

                  {showHandled && thread.clientDelegationNote && (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                      Delegated to {session.assistantName}: “{thread.clientDelegationNote}”
                    </div>
                  )}

                  {/* Extracted deadline / meeting if any */}
                  {thread.extractedDates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                      {thread.extractedDates.map((d, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-800">{d.title}:</span>
                          <span className="tabular-nums">
                            {d.dateLabel} · {d.timeLabel}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Row */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : thread.id)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 py-1.5"
                    >
                      <span>
                        {isExpanded
                          ? 'Hide Original Conversation'
                          : `Open Conversation (${thread.messages.length})`}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {!showHandled && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setDelegateId(isDelegating ? null : thread.id);
                            setDelegationNote('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Let {session.assistantName.split(' ')[0]} Handle</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleMarkDone(thread.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Mark Handled</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Optional Delegation Note Form */}
                  {isDelegating && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                      <label className="block text-xs font-medium text-slate-700">
                        Quick note for {session.assistantName} (optional)
                      </label>
                      <input
                        type="text"
                        value={delegationNote}
                        onChange={(e) => setDelegationNote(e.target.value)}
                        placeholder={`e.g. "Confirm I'm aligned and ask Maya to schedule the call"`}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDelegateId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelegateSubmit(thread.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                        >
                          <span>Assign to {session.assistantName}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded Original Conversation + Personal Reply */}
                  {isExpanded && (
                    <div className="pt-4 border-t border-slate-200 space-y-4">
                      <div className="space-y-4">
                        {thread.messages.map((m) => (
                          <div
                            key={m.id}
                            className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-slate-900">
                                {m.senderName}{' '}
                                <span className="font-normal text-slate-500">
                                  &lt;{m.senderEmail}&gt;
                                </span>
                              </span>
                              <time className="text-slate-500 tabular-nums">
                                {formatFullDateTime(m.sentAt)}
                              </time>
                            </div>
                            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                              {m.body}
                            </p>
                          </div>
                        ))}
                      </div>

                      {!showHandled && (
                        <div className="space-y-2.5 pt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700">
                              Quick Personal Reply as {session.clientName}
                            </span>
                            <button
                              type="button"
                              disabled={draftingId === thread.id}
                              onClick={() => handleDraftForClient(thread.id)}
                              className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                            >
                              {draftingId === thread.id
                                ? 'Drafting...'
                                : 'Draft reply with AI'}
                            </button>
                          </div>
                          <textarea
                            rows={4}
                            value={replyTextByThread[thread.id] ?? ''}
                            onChange={(e) =>
                              setReplyTextByThread((prev) => ({
                                ...prev,
                                [thread.id]: e.target.value,
                              }))
                            }
                            placeholder={`Write your direct reply to ${thread.primarySenderName}...`}
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={
                                isBusy || !(replyTextByThread[thread.id] ?? '').trim()
                              }
                              onClick={() => handleSendReply(thread.id)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Approve & Send Personal Reply</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
