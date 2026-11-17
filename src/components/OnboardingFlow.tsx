import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import type { ConnectedAccount, EmailProvider, UserSession } from '../types/email';
import { Avatar } from './Avatar';
import { ConnectAccountModal } from './ConnectAccountModal';

interface OnboardingFlowProps {
  session: UserSession;
  accounts: ConnectedAccount[];
  onLogin: (payload: {
    assistantName: string;
    assistantEmail: string;
    clientName: string;
    clientEmail: string;
  }) => Promise<void>;
  onConnectAccount: (payload: {
    provider: EmailProvider;
    email: string;
    displayName: string;
  }) => Promise<void>;
  onComplete: () => Promise<void>;
}

export function OnboardingFlow({
  session,
  accounts,
  onLogin,
  onConnectAccount,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<'account' | 'connect'>(
    session.signedIn ? 'connect' : 'account'
  );
  const [assistantName, setAssistantName] = useState(session.assistantName);
  const [assistantEmail, setAssistantEmail] = useState(session.assistantEmail);
  const [clientName, setClientName] = useState(session.clientName);
  const [clientEmail, setClientEmail] = useState(session.clientEmail);
  const [submitting, setSubmitting] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onLogin({
        assistantName,
        assistantEmail,
        clientName,
        clientEmail,
      });
      setStep('connect');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterWorkspace = async () => {
    setSubmitting(true);
    try {
      if (!session.signedIn) {
        await onLogin({
          assistantName,
          assistantEmail,
          clientName,
          clientEmail,
        });
      }
      await onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Clean 3-zone header */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 lg:px-10 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          RelayDesk
        </span>
        <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
          Personal Assistant & Executive Email Triage
        </span>
        <button
          type="button"
          onClick={handleEnterWorkspace}
          disabled={submitting}
          className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Skip to Live Demo
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        {/* Left editorial column */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
          <div className="space-y-5">
            <p className="text-xs font-medium text-blue-700 tracking-wide">
              Workspace Setup · Step {step === 'account' ? '1' : '2'} of 2
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 leading-[1.15] text-balance">
              Stop guessing which emails need you versus your client.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              RelayDesk connects your client’s Gmail and Outlook inboxes into one
              structured command workspace. Every conversation is automatically
              analyzed to determine whether the{' '}
              <span className="font-medium text-slate-900">Assistant</span>, the{' '}
              <span className="font-medium text-slate-900">Client</span>, or{' '}
              <span className="font-medium text-slate-900">No One</span> needs to
              reply.
            </p>
          </div>

          {/* Three concise mechanism highlights without nested card clutter */}
          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <UserCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Automatic Reply Responsibility
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Scheduling, logistics, and follow-ups route to you. Strategic
                  approvals and personal decisions surface for your client.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Inbox className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Minimalistic Client Brief
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Clients see only what genuinely needs their attention—with a
                  1-line reason why and one-click delegation back to you.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Human-Approved AI Drafting
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Gemini prepares tailored replies and summarizes multi-message
                  threads; nothing is ever sent without explicit review.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right setup panel */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
          {step === 'account' ? (
            <form onSubmit={handleAccountSubmit} className="space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-slate-900">
                  Sign in to your Assistant Workspace
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Configure the personal assistant and primary client pairing for this
                  workspace.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-4">
                <Avatar
                  name={assistantName}
                  src="/src/assets/images/avatar_assistant_1794899104401.jpg"
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500">
                    Active Workspace Pair
                  </p>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {assistantName} supporting {clientName}
                  </p>
                </div>
                <Avatar
                  name={clientName}
                  src="/src/assets/images/avatar_client_1794899104143.jpg"
                  size="lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Personal Assistant Name
                  </label>
                  <input
                    type="text"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Assistant Email
                  </label>
                  <input
                    type="email"
                    value={assistantEmail}
                    onChange={(e) => setAssistantEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Client / Executive Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Primary Client Email
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  Pre-loaded with 12 realistic executive threads
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Continue to Email Connections</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-slate-900">
                    Connect Client Email Accounts
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Gmail and Microsoft Outlook accounts below are synced in prototype
                    mode. You can also authorize an additional mailbox.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConnectModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50/60 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  + Connect Account
                </button>
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-4 flex items-center justify-between gap-4 bg-white first:rounded-t-lg last:rounded-b-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {acc.email}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {acc.provider === 'gmail'
                            ? 'Google Workspace / Gmail'
                            : 'Microsoft Outlook / 365'}{' '}
                          ·{' '}
                          <span className="tabular-nums">
                            {acc.totalSynced.toLocaleString()} emails indexed
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {acc.status === 'connected' ? 'Synced' : acc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Prototype note: Mailbox OAuth & sample threads are simulated; AI
                    triage & drafting run live on Gemini.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('account')}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Back to Profile
                </button>
                <button
                  type="button"
                  onClick={handleEnterWorkspace}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Open Assistant Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <ConnectAccountModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        onConnect={onConnectAccount}
        defaultClientName={clientName}
      />
    </div>
  );
}
