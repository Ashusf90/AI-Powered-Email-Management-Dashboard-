export type Responsibility =
  | 'ASSISTANT_TO_REPLY'
  | 'CLIENT_TO_REPLY'
  | 'NO_REPLY_NEEDED';

export type EmailSegment =
  | 'Action Required'
  | 'Waiting for Response'
  | 'Meetings & Appointments'
  | 'Important'
  | 'General';

export type EmailProvider = 'gmail' | 'outlook';

export interface ConnectedAccount {
  id: string;
  provider: EmailProvider;
  email: string;
  displayName: string;
  status: 'connected' | 'syncing' | 'disconnected' | 'error';
  lastSyncedAt: string;
  unreadCount: number;
  totalSynced: number;
}

export interface EmailMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  senderRole?: string;
  senderAvatar?: string;
  recipientEmail: string;
  sentAt: string;
  body: string;
  isFromUs?: boolean;
  sentByRole?: 'assistant' | 'client';
}

export interface ExtractedDate {
  title: string;
  dateLabel: string;
  timeLabel: string;
  locationOrLink?: string;
}

export interface EmailThread {
  id: string;
  accountId: string;
  provider: EmailProvider;
  subject: string;
  participants: string[];
  primarySenderName: string;
  primarySenderEmail: string;
  primarySenderCompany?: string;
  primarySenderAvatar?: string;
  lastMessageAt: string;
  isUnread: boolean;
  isImportant: boolean;
  isArchived: boolean;
  isCompleted: boolean;
  responsibility: Responsibility;
  responsibilityLockedByHuman: boolean;
  needsReview: boolean;
  confidence: number;
  responsibilityReason: string;
  clientActionWhy: string;
  summary: string;
  importantHighlights: string[];
  segments: EmailSegment[];
  extractedDates: ExtractedDate[];
  clientDelegationNote?: string;
  messages: EmailMessage[];
}

export interface UserSession {
  signedIn: boolean;
  assistantName: string;
  assistantEmail: string;
  clientName: string;
  clientEmail: string;
  onboardingCompleted: boolean;
}

export interface WorkspaceState {
  session: UserSession;
  accounts: ConnectedAccount[];
  threads: EmailThread[];
}

export interface CopilotCitation {
  threadId: string;
  subject: string;
  senderName: string;
  responsibility: Responsibility;
}

export interface CopilotAnswer {
  answer: string;
  citations: CopilotCitation[];
  suggestedFilter?: string;
}

export type ChatRoleId = 'strategist' | 'drafter' | 'fast';

export interface ChatTurnMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  citations?: CopilotCitation[];
}

export interface ChatReplyPayload {
  reply: string;
  modelUsed: string;
  citations: CopilotCitation[];
}

