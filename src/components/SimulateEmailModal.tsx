import { Loader2, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { EmailProvider } from '../types/email';

interface SimulateEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    senderName: string;
    senderEmail: string;
    senderCompany: string;
    subject: string;
    body: string;
    provider: EmailProvider;
  }) => Promise<void>;
}

const PRESETS = [
  {
    label: 'Scheduling Request (Assistant)',
    provider: 'gmail' as EmailProvider,
    senderName: 'Rachel Kim',
    senderEmail: 'rachel@sequoiacap.com',
    senderCompany: 'Sequoia Capital',
    subject: 'Coffee or 30-min catch-up next week in Menlo Park?',
    body: `Hi Maya & Elena,\n\nI will be on Sand Hill Road next Tuesday and Wednesday afternoon. Would Elena have 30 minutes for a quick catch-up before Thanksgiving? Maya, happy to coordinate directly with you on exact calendar slots and send a calendar hold.\n\nBest,\nRachel`,
  },
  {
    label: 'Board Resolution Sign-Off (Client)',
    provider: 'outlook' as EmailProvider,
    senderName: 'Arthur Pendelton',
    senderEmail: 'apendelton@wsgr.com',
    senderCompany: 'Wilson Sonsini',
    subject: 'URGENT: Personal Signature & Consent Required — Subsidiary Formation',
    body: `Elena,\n\nTo file the Delaware subsidiary incorporation before Friday's tax cutoff, we need your personal confirmation as Sole Director on the indemnification threshold in Section 3(b). Please review and reply directly with your approval or requested edits by Thursday noon.\n\nRegards,\nArthur`,
  },
  {
    label: 'Ambiguous Invitation (Needs Review)',
    provider: 'gmail' as EmailProvider,
    senderName: 'Nadia Patel',
    senderEmail: 'nadia@techpolicyroundtable.org',
    senderCompany: 'Tech Policy Roundtable',
    subject: 'Private Senate Dinner — Dec 9 Interest & Delegation',
    body: `Hi Elena,\n\nWe are hosting an off-the-record dinner with three Senate AI subcommittee staffers on December 9 in Washington, DC. Let me know if you'd like to share your perspective on foundation model liability—or if Maya wants to check your travel availability first before you decide.\n\nWarmly,\nNadia`,
  },
];

export function SimulateEmailModal({
  isOpen,
  onClose,
  onSubmit,
}: SimulateEmailModalProps) {
  const [provider, setProvider] = useState<EmailProvider>('gmail');
  const [senderName, setSenderName] = useState(PRESETS[0].senderName);
  const [senderEmail, setSenderEmail] = useState(PRESETS[0].senderEmail);
  const [senderCompany, setSenderCompany] = useState(PRESETS[0].senderCompany);
  const [subject, setSubject] = useState(PRESETS[0].subject);
  const [body, setBody] = useState(PRESETS[0].body);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const applyPreset = (idx: number) => {
    const p = PRESETS[idx];
    setProvider(p.provider);
    setSenderName(p.senderName);
    setSenderEmail(p.senderEmail);
    setSenderCompany(p.senderCompany);
    setSubject(p.subject);
    setBody(p.body);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        senderName,
        senderEmail,
        senderCompany,
        subject,
        body,
        provider,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to classify incoming email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulate-email-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2
              id="simulate-email-title"
              className="text-base font-semibold text-slate-900"
            >
              Simulate Incoming Email & Live AI Classification
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Gemini analyzes the incoming message and assigns reply responsibility automatically
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto thin-scrollbar">
          <div>
            <span className="block text-xs font-medium text-slate-600 mb-2">
              Load Realistic Scenario
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(i)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sender Name
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sender Email
              </label>
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Inbox Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as EmailProvider)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="gmail">Gmail</option>
                <option value="outlook">Microsoft Outlook</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Email Body
            </label>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Classifying with AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Receive & Auto-Classify</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
