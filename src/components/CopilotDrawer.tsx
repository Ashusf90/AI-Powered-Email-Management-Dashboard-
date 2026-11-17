import {
  ArrowUpRight,
  Loader2,
  MessageSquare,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getResponsibilityMeta } from '../lib/format';
import type { ChatRoleId, ChatTurnMessage } from '../types/email';
import { LiveVoicePanel } from './LiveVoicePanel';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeThreadId?: string;
  activeThreadSubject?: string;
  onSelectThread: (threadId: string) => void;
  onApplyFilter?: (filterKey: string) => void;
}

const ROLE_OPTIONS: Array<{
  id: ChatRoleId;
  label: string;
  modelLabel: string;
  description: string;
}> = [
  {
    id: 'strategist',
    label: 'Triage Strategist',
    modelLabel: 'gemini-4-hydrogen',
    description: 'Prioritization, risks, and Assistant vs. Client guidance',
  },
  {
    id: 'drafter',
    label: 'Drafting Advisor',
    modelLabel: 'gemini-4-hydrogen',
    description: 'Refine tone, wording, and executive replies across turns',
  },
  {
    id: 'fast',
    label: 'Rapid Lookup',
    modelLabel: 'gemini-3.1-flash-lite',
    description: 'Fast answers on dates, senders, and pending items',
  },
];

const STARTER_QUESTIONS = [
  'Show me emails that need my attention today.',
  'Which emails require the client’s personal reply and why?',
  'What am I waiting for a response on?',
  'Summarize the currently open conversation.',
];

export function CopilotDrawer({
  isOpen,
  onClose,
  activeThreadId,
  activeThreadSubject,
  onSelectThread,
}: CopilotDrawerProps) {
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const [roleId, setRoleId] = useState<ChatRoleId>('strategist');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurnMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isOpen) return null;

  const selectedRole =
    ROLE_OPTIONS.find((r) => r.id === roleId) || ROLE_OPTIONS[0];

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput('');
    setError(null);

    const userTurn: ChatTurnMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };

    const historyForApi = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userTurn]);
    setLoading(true);

    try {
      const res = await api.chat({
        message: trimmed,
        history: historyForApi,
        roleId,
        activeThreadId,
      });

      const modelTurn: ChatTurnMessage = {
        id: `msg-${Date.now()}-m`,
        role: 'model',
        text: res.reply,
        modelUsed: res.modelUsed,
        citations: res.citations,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, modelTurn]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reach Gemini assistant.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
      role="dialog"
      aria-modal="true"
      aria-label="RelayDesk AI Assistant"
    >
      <div className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-700 shrink-0" />
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  RelayDesk AI Assistant
                </h2>
              </div>
              {activeThreadSubject && (
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  Open thread: {activeThreadSubject}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI assistant"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switcher: Multi-Turn Chat vs Live Voice */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'chat'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Multi-Turn Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('voice')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'voice'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Live Voice</span>
            </button>
          </div>
        </div>

        {mode === 'voice' ? (
          <div className="flex-1 min-h-0">
            <LiveVoicePanel />
          </div>
        ) : (
          <>
            {/* Chatbot Role Selector Bar */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-500">
                  Assistant Role
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500">
                    {selectedRole.modelLabel}
                  </span>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMessages([]);
                        setError(null);
                      }}
                      title="Start new conversation"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoleId(r.id)}
                    className={`px-2 py-1.5 text-[11px] font-medium rounded-md border text-center transition-colors truncate ${
                      roleId === r.id
                        ? 'bg-white border-blue-600 text-blue-800 shadow-sm'
                        : 'bg-white/60 border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                {selectedRole.description}
              </p>
            </div>

            {/* Scrollable Multi-Turn Message Thread */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-4 thin-scrollbar"
            >
              {messages.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Start a multi-turn conversation with your RelayDesk{' '}
                    <span className="font-medium text-slate-900">
                      {selectedRole.label}
                    </span>
                    . Follow-up questions remember full context.
                  </p>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500">
                      Suggested prompts
                    </p>
                    {STARTER_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendMessage(q)}
                        className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((turn) => (
                  <div
                    key={turn.id}
                    className={`space-y-2 ${
                      turn.role === 'user' ? 'pl-8' : 'pr-4'
                    }`}
                  >
                    <div
                      className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                        turn.role === 'user'
                          ? 'bg-blue-700 text-white'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      {turn.text}

                      {turn.citations && turn.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1.5">
                          <p className="text-[11px] font-medium text-slate-500">
                            Referenced Threads
                          </p>
                          {turn.citations.map((c) => {
                            const meta = getResponsibilityMeta(c.responsibility);
                            return (
                              <button
                                key={c.threadId}
                                type="button"
                                onClick={() => {
                                  onSelectThread(c.threadId);
                                  onClose();
                                }}
                                className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-md border border-slate-200 hover:border-blue-600 hover:bg-blue-50/30 transition-colors"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">
                                    {c.subject}
                                  </p>
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {c.senderName} ·{' '}
                                    <span className={meta.textColor}>
                                      {meta.label}
                                    </span>
                                  </p>
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div
                      className={`flex items-center gap-2 text-[10px] text-slate-400 font-mono tabular-nums ${
                        turn.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>
                        {turn.role === 'user' ? 'You' : selectedRole.label}
                      </span>
                      {turn.modelUsed && <span>· {turn.modelUsed}</span>}
                      <span>· {turn.timestamp}</span>
                    </div>
                  </div>
                ))
              )}

              {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
                  <span>Thinking with {selectedRole.modelLabel}...</span>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Multi-Turn Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="p-4 border-t border-slate-200 bg-white shrink-0"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Ask ${selectedRole.label}...`}
                  className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send chat message"
                  className="p-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
