import type {
  CopilotAnswer,
  EmailProvider,
  EmailThread,
  Responsibility,
  WorkspaceState,
} from '../types/email';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getWorkspace: () => request<WorkspaceState>('/api/workspace'),

  resetWorkspace: () =>
    request<WorkspaceState>('/api/workspace/reset', { method: 'POST' }),

  login: (payload: {
    assistantName?: string;
    assistantEmail?: string;
    clientName?: string;
    clientEmail?: string;
  }) =>
    request<WorkspaceState>('/api/session/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  completeOnboarding: () =>
    request<WorkspaceState>('/api/session/complete-onboarding', {
      method: 'POST',
    }),

  connectAccount: (payload: {
    provider: EmailProvider;
    email: string;
    displayName?: string;
  }) =>
    request<WorkspaceState>('/api/accounts/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  syncAccount: (accountId: string) =>
    request<WorkspaceState>(`/api/accounts/${accountId}/sync`, {
      method: 'POST',
    }),

  disconnectAccount: (accountId: string) =>
    request<WorkspaceState>(`/api/accounts/${accountId}`, {
      method: 'DELETE',
    }),

  updateThread: (
    threadId: string,
    payload: Partial<EmailThread> & { manualResponsibilityReason?: string }
  ) =>
    request<{ thread: EmailThread; workspace: WorkspaceState }>(
      `/api/threads/${threadId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  analyzeThread: (threadId: string) =>
    request<{ thread: EmailThread; workspace: WorkspaceState }>(
      `/api/threads/${threadId}/analyze`,
      { method: 'POST' }
    ),

  simulateReply: (
    threadId: string,
    payload: { senderName?: string; senderEmail?: string; body: string }
  ) =>
    request<{ thread: EmailThread; workspace: WorkspaceState }>(
      `/api/threads/${threadId}/simulate-reply`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  simulateIncomingEmail: (payload: {
    senderName: string;
    senderEmail: string;
    senderCompany?: string;
    subject: string;
    body: string;
    provider: EmailProvider;
  }) =>
    request<{ thread: EmailThread; workspace: WorkspaceState }>(
      '/api/threads/simulate-incoming',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  draftReply: (
    threadId: string,
    payload: {
      authorRole: 'assistant' | 'client';
      tone: 'concise' | 'warm' | 'formal';
      instruction?: string;
    }
  ) =>
    request<{ subject: string; body: string; rationale: string }>(
      `/api/threads/${threadId}/draft`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  sendReply: (
    threadId: string,
    payload: {
      body: string;
      authorRole: 'assistant' | 'client';
      markCompleted?: boolean;
      nextResponsibility?: Responsibility;
    }
  ) =>
    request<{ thread: EmailThread; workspace: WorkspaceState }>(
      `/api/threads/${threadId}/send`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  askCopilot: (question: string, activeThreadId?: string) =>
    request<CopilotAnswer>('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, activeThreadId }),
    }),

  chat: (payload: {
    message: string;
    history: Array<{ role: 'user' | 'model'; text: string }>;
    roleId: import('../types/email').ChatRoleId;
    activeThreadId?: string;
  }) =>
    request<import('../types/email').ChatReplyPayload>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
