import { Check, Loader2, Mail, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { EmailProvider } from '../types/email';

interface ConnectAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (payload: {
    provider: EmailProvider;
    email: string;
    displayName: string;
  }) => Promise<void>;
  defaultClientName: string;
}

export function ConnectAccountModal({
  isOpen,
  onClose,
  onConnect,
  defaultClientName,
}: ConnectAccountModalProps) {
  const [step, setStep] = useState<'provider' | 'oauth' | 'syncing'>('provider');
  const [provider, setProvider] = useState<EmailProvider>('gmail');
  const [email, setEmail] = useState('elena.board@vanceventures.com');
  const [displayName, setDisplayName] = useState(`${defaultClientName} · Executive`);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectProvider = (selected: EmailProvider) => {
    setProvider(selected);
    setEmail(
      selected === 'gmail'
        ? 'elena.personal@gmail.com'
        : 'elena@vanceadvisory.org'
    );
    setDisplayName(
      `${defaultClientName} · ${selected === 'gmail' ? 'Gmail' : 'Microsoft 365'}`
    );
    setError(null);
    setStep('oauth');
  };

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter an email address to connect.');
      return;
    }
    setError(null);
    setStep('syncing');
    try {
      await new Promise((r) => setTimeout(r, 750));
      await onConnect({ provider, email, displayName });
      setStep('provider');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect account.');
      setStep('oauth');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-account-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="connect-account-title"
              className="text-base font-semibold text-slate-900"
            >
              Connect Client Email Account
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulated OAuth 2.0 connection flow for prototype demonstration
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {step === 'provider' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Choose an email provider to authorize read/draft sync for{' '}
                <span className="font-medium text-slate-900">{defaultClientName}</span>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectProvider('gmail')}
                  className="flex flex-col items-start p-4 border border-slate-200 rounded-lg hover:border-blue-600 hover:bg-blue-50/30 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 mb-3">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    Google Workspace / Gmail
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    OAuth 2.0 · Read, label, and draft replies
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectProvider('outlook')}
                  className="flex flex-col items-start p-4 border border-slate-200 rounded-lg hover:border-blue-600 hover:bg-blue-50/30 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 mb-3">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    Microsoft Outlook / 365
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    Microsoft Graph · Inbox & calendar sync
                  </span>
                </button>
              </div>
            </div>
          )}

          {step === 'oauth' && (
            <form onSubmit={handleAuthorize} className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {provider === 'gmail'
                      ? 'Google OAuth 2.0 Authorization'
                      : 'Microsoft Entra ID Authorization'}
                  </span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1.5 pl-6 list-disc">
                  <li>Read incoming threads & conversation history for AI triage</li>
                  <li>Prepare draft replies for human review before sending</li>
                  <li>Extract scheduled meetings and action deadlines</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Mailbox Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  placeholder="name@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Workspace Label
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  placeholder="Executive Inbox"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 font-medium">{error}</p>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('provider')}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Authorize & Sync Inbox
                </button>
              </div>
            </form>
          )}

          {step === 'syncing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <Loader2 className="w-7 h-7 text-blue-700 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Establishing secure sync with {email}
                </p>
                <p className="text-xs text-slate-500">
                  Verifying scopes and indexing recent conversations...
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-700 pt-1">
                <Check className="w-3.5 h-3.5" />
                <span>AI responsibility engine ready</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
