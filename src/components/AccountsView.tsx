import {
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { formatFullDateTime } from '../lib/format';
import type { ConnectedAccount, EmailProvider, UserSession } from '../types/email';
import { Avatar } from './Avatar';
import { ConnectAccountModal } from './ConnectAccountModal';

interface AccountsViewProps {
  session: UserSession;
  accounts: ConnectedAccount[];
  onConnectAccount: (payload: {
    provider: EmailProvider;
    email: string;
    displayName: string;
  }) => Promise<void>;
  onSyncAccount: (accountId: string) => Promise<void>;
  onDisconnectAccount: (accountId: string) => Promise<void>;
  onResetDemo: () => Promise<void>;
  onOpenOnboarding: () => void;
}

export function AccountsView({
  session,
  accounts,
  onConnectAccount,
  onSyncAccount,
  onDisconnectAccount,
  onResetDemo,
  onOpenOnboarding,
}: AccountsViewProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      await onSyncAccount(id);
    } finally {
      setSyncingId(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await onResetDemo();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Connected Email Accounts & Workspace Setup
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage synchronized Gmail and Microsoft Outlook mailboxes for{' '}
            {session.clientName}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            Re-run Onboarding
          </button>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Mailbox</span>
          </button>
        </div>
      </div>

      {/* Assistant + Client Pairing */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          Active Assistant & Client Pairing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex items-center gap-3.5">
            <Avatar
              name={session.assistantName}
              src="/src/assets/images/avatar_assistant_1794899104401.jpg"
              size="lg"
            />
            <div>
              <p className="text-xs text-slate-500">Personal Assistant</p>
              <p className="text-sm font-semibold text-slate-900">
                {session.assistantName}
              </p>
              <p className="text-xs text-slate-600">{session.assistantEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <Avatar
              name={session.clientName}
              src="/src/assets/images/avatar_client_1794899104143.jpg"
              size="lg"
            />
            <div>
              <p className="text-xs text-slate-500">Executive Client</p>
              <p className="text-sm font-semibold text-slate-900">
                {session.clientName}
              </p>
              <p className="text-xs text-slate-600">{session.clientEmail}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Accounts Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Mailboxes ({accounts.length})
          </h2>
          <span className="text-xs text-slate-500">
            Simulated OAuth Connections · Real-time AI Classification Active
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {acc.email}
                    </p>
                    <span className="text-xs text-slate-500">
                      · {acc.provider === 'gmail' ? 'Gmail' : 'Microsoft Outlook'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {acc.displayName} · {acc.totalSynced.toLocaleString()} synced ·{' '}
                    {acc.unreadCount} unread · Last sync{' '}
                    {formatFullDateTime(acc.lastSyncedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium mr-2 ${
                    acc.status === 'connected'
                      ? 'text-emerald-700'
                      : 'text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {acc.status === 'connected' ? 'Connected' : 'Disconnected'}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => handleSync(acc.id)}
                  disabled={syncingId === acc.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  {syncingId === acc.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Sync</span>
                </button>

                {acc.status === 'connected' && (
                  <button
                    type="button"
                    onClick={() => onDisconnectAccount(acc.id)}
                    aria-label={`Disconnect ${acc.email}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Demo State Reset */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Reset Prototype Dataset
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Restore all 12 original sample email conversations, classifications, and
            unread counts to their starting state.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {resetting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          <span>Restore Sample Inbox</span>
        </button>
      </section>

      <ConnectAccountModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnect={onConnectAccount}
        defaultClientName={session.clientName}
      />
    </div>
  );
}
