import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ChatReplyPayload,
  ChatRoleId,
  CopilotAnswer,
  EmailSegment,
  EmailThread,
  ExtractedDate,
  Responsibility,
} from '../src/types/email.ts';

const MODEL_NAME = 'gemini-4-hydrogen';
const FAST_MODEL_NAME = 'gemini-3.1-flash-lite';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Please set it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatConversationHistory(thread: EmailThread): string {
  return thread.messages
    .map(
      (msg, idx) =>
        `[Message ${idx + 1}] From: ${msg.senderName} <${msg.senderEmail}> | To: ${msg.recipientEmail} | Date: ${msg.sentAt}\n${msg.body}`
    )
    .join('\n\n---\n\n');
}

export interface ThreadAnalysisResult {
  responsibility: Responsibility;
  needsReview: boolean;
  confidence: number;
  responsibilityReason: string;
  clientActionWhy: string;
  summary: string;
  importantHighlights: string[];
  segments: EmailSegment[];
  extractedDates: ExtractedDate[];
}

export async function analyzeEmailThread(
  thread: EmailThread,
  assistantName: string,
  clientName: string
): Promise<ThreadAnalysisResult> {
  const ai = getGeminiClient();

  const prompt = `Analyze the following email conversation managed by Personal Assistant "${assistantName}" on behalf of executive Client "${clientName}".

Subject: ${thread.subject}
Account Provider: ${thread.provider}
Conversation History (oldest to newest):
${formatConversationHistory(thread)}

Determine who is responsible for replying NEXT based on the latest message and full history:
1. ASSISTANT_TO_REPLY: Scheduling/rescheduling meetings, travel logistics, routine business inquiries, NDA/document sending, administrative follow-ups, or items explicitly directed to the assistant.
2. CLIENT_TO_REPLY: Personal executive decisions, investor/board approvals, sensitive HR/compensation matters, direct requests for the client's personal viewpoint/sign-off, or personal invitations needing the client's choice.
3. NO_REPLY_NEEDED: Newsletters, automated alerts/receipts, purely informational updates, resolved/confirmed conversations, or threads where we sent the last message and are merely waiting for the other party to reply.

IMPORTANT RULES:
- Consider the LATEST message in context of the entire thread. If the client or assistant already sent the final confirmation and the other side only acknowledged or we are waiting on an external party, classify as NO_REPLY_NEEDED (and add "Waiting for Response" segment if awaiting their reply).
- If ownership is genuinely ambiguous (e.g., an invitation asking the client's personal interest while also offering to let the assistant schedule a call, or unclear whether the client wants to reply personally), set needsReview = true and confidence <= 0.72.
- Only include valid segments from: "Action Required", "Waiting for Response", "Meetings & Appointments", "Important", "General".
- Extract any concrete upcoming meetings, deadlines, or flights into extractedDates.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction:
        'You are an expert executive triage AI assisting a personal assistant and their executive client. Be accurate, concise, and never invent dates or details not present in the email.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          responsibility: {
            type: Type.STRING,
            description:
              'One of ASSISTANT_TO_REPLY, CLIENT_TO_REPLY, or NO_REPLY_NEEDED',
          },
          needsReview: {
            type: Type.BOOLEAN,
            description:
              'True if responsibility is ambiguous or confidence is below 0.78 and requires assistant human review.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence score between 0.0 and 1.0',
          },
          responsibilityReason: {
            type: Type.STRING,
            description:
              'One concise sentence explaining why this responsibility classification applies.',
          },
          clientActionWhy: {
            type: Type.STRING,
            description:
              'If CLIENT_TO_REPLY, a crisp 1-sentence note addressed to the client ("You...") explaining what personal decision or input is needed. Otherwise empty string.',
          },
          summary: {
            type: Type.STRING,
            description: '1-2 sentence executive summary of the conversation.',
          },
          importantHighlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Up to 3 short key facts, numbers, or deadlines.',
          },
          segments: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'Applicable segments from: Action Required, Waiting for Response, Meetings & Appointments, Important, General',
          },
          extractedDates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                dateLabel: { type: Type.STRING },
                timeLabel: { type: Type.STRING },
                locationOrLink: { type: Type.STRING },
              },
            },
          },
        },
        required: [
          'responsibility',
          'needsReview',
          'confidence',
          'responsibilityReason',
          'clientActionWhy',
          'summary',
          'importantHighlights',
          'segments',
          'extractedDates',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ThreadAnalysisResult>;

  const validResponsibilities: Responsibility[] = [
    'ASSISTANT_TO_REPLY',
    'CLIENT_TO_REPLY',
    'NO_REPLY_NEEDED',
  ];
  const responsibility: Responsibility = validResponsibilities.includes(
    parsed.responsibility as Responsibility
  )
    ? (parsed.responsibility as Responsibility)
    : 'ASSISTANT_TO_REPLY';

  const validSegments: EmailSegment[] = [
    'Action Required',
    'Waiting for Response',
    'Meetings & Appointments',
    'Important',
    'General',
  ];
  const segments = (parsed.segments ?? []).filter((s): s is EmailSegment =>
    validSegments.includes(s as EmailSegment)
  );
  if (segments.length === 0) {
    segments.push(responsibility === 'NO_REPLY_NEEDED' ? 'General' : 'Action Required');
  }

  return {
    responsibility,
    needsReview: Boolean(parsed.needsReview) || (parsed.confidence ?? 0.9) < 0.78,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.88,
    responsibilityReason:
      parsed.responsibilityReason || 'Analyzed based on latest message content.',
    clientActionWhy:
      responsibility === 'CLIENT_TO_REPLY'
        ? parsed.clientActionWhy || parsed.responsibilityReason || ''
        : '',
    summary: parsed.summary || thread.summary,
    importantHighlights: Array.isArray(parsed.importantHighlights)
      ? parsed.importantHighlights.slice(0, 4)
      : [],
    segments,
    extractedDates: Array.isArray(parsed.extractedDates)
      ? parsed.extractedDates
      : [],
  };
}

export interface DraftReplyResult {
  subject: string;
  body: string;
  rationale: string;
}

export async function draftEmailReply(
  thread: EmailThread,
  options: {
    authorRole: 'assistant' | 'client';
    tone: 'concise' | 'warm' | 'formal';
    instruction?: string;
    assistantName: string;
    clientName: string;
  }
): Promise<DraftReplyResult> {
  const ai = getGeminiClient();

  const personaDesc =
    options.authorRole === 'assistant'
      ? `You are drafting a reply sent by Personal Assistant "${options.assistantName}" on behalf of executive "${options.clientName}". Sign off cleanly as ${options.assistantName}, Executive Assistant to ${options.clientName}.`
      : `You are drafting a direct personal reply from executive "${options.clientName}". Sign off cleanly as ${options.clientName.split(' ')[0]}.`;

  const prompt = `${personaDesc}
Tone: ${options.tone}
${options.instruction ? `Specific User Instruction: ${options.instruction}` : ''}

Thread Subject: ${thread.subject}
Client Delegation Note (if any): ${thread.clientDelegationNote || 'None'}
Conversation History:
${formatConversationHistory(thread)}

Write a realistic, ready-to-review email reply body (no placeholder brackets like [Insert Date] unless truly missing, use facts from the thread). Also provide a brief 1-sentence rationale explaining what the draft addresses.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction:
        'You write crisp, executive-grade email drafts tailored for a personal assistant platform. Keep drafts clear, polite, and immediately actionable.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          body: { type: Type.STRING },
          rationale: { type: Type.STRING },
        },
        required: ['subject', 'body', 'rationale'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<DraftReplyResult>;
  return {
    subject: parsed.subject || `Re: ${thread.subject.replace(/^Re:\s*/i, '')}`,
    body: parsed.body || '',
    rationale: parsed.rationale || 'Draft prepared from conversation context.',
  };
}

export async function askInboxCopilot(
  question: string,
  threads: EmailThread[],
  activeThreadId: string | undefined,
  assistantName: string,
  clientName: string
): Promise<CopilotAnswer> {
  const ai = getGeminiClient();

  const compactThreads = threads
    .filter((t) => !t.isArchived)
    .map((t) => ({
      id: t.id,
      subject: t.subject,
      senderName: t.primarySenderName,
      senderCompany: t.primarySenderCompany,
      provider: t.provider,
      lastMessageAt: t.lastMessageAt,
      isUnread: t.isUnread,
      isImportant: t.isImportant,
      isCompleted: t.isCompleted,
      responsibility: t.responsibility,
      needsReview: t.needsReview,
      responsibilityReason: t.responsibilityReason,
      clientActionWhy: t.clientActionWhy,
      segments: t.segments,
      summary: t.summary,
      highlights: t.importantHighlights,
      extractedDates: t.extractedDates,
      latestMessage: t.messages[t.messages.length - 1]?.body.slice(0, 600),
    }));

  const prompt = `Assistant: ${assistantName}
Executive Client: ${clientName}
Currently Open Thread ID: ${activeThreadId || 'None'}

User Question: "${question}"

Inbox Threads JSON:
${JSON.stringify(compactThreads, null, 2)}

Answer the user's question accurately using ONLY the provided inbox threads.
- If the user asks about "this conversation" or "this email", focus on the Currently Open Thread ID.
- Cite the exact threadIds you reference in the citations array so the user can click straight into them.
- Optionally suggest one filter key from: "all", "assistant", "client", "no_reply", "needs_review", "action_required", "waiting", "meetings", "important" if relevant.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction:
        'You are the RelayDesk AI Email Assistant helping a personal assistant triage and understand their client inbox. Be concise, factual, structured with short clear sentences or bullets, and always cite relevant thread IDs.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: {
            type: Type.STRING,
            description: 'Clear, helpful response answering the user query.',
          },
          citedThreadIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Thread IDs directly relevant to the answer.',
          },
          suggestedFilter: {
            type: Type.STRING,
            description:
              'Optional filter key: all, assistant, client, no_reply, needs_review, action_required, waiting, meetings, important',
          },
        },
        required: ['answer', 'citedThreadIds'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    answer?: string;
    citedThreadIds?: string[];
    suggestedFilter?: string;
  };

  const citedIds = new Set(parsed.citedThreadIds ?? []);
  const citations = threads
    .filter((t) => citedIds.has(t.id))
    .map((t) => ({
      threadId: t.id,
      subject: t.subject,
      senderName: t.primarySenderName,
      responsibility: t.responsibility,
    }));

  return {
    answer: parsed.answer || 'I could not find matching details in the inbox.',
    citations,
    suggestedFilter: parsed.suggestedFilter,
  };
}

function buildCompactInboxSnapshot(threads: EmailThread[]) {
  return threads
    .filter((t) => !t.isArchived)
    .map((t) => ({
      id: t.id,
      subject: t.subject,
      senderName: t.primarySenderName,
      senderCompany: t.primarySenderCompany,
      provider: t.provider,
      lastMessageAt: t.lastMessageAt,
      isUnread: t.isUnread,
      isImportant: t.isImportant,
      isCompleted: t.isCompleted,
      responsibility: t.responsibility,
      needsReview: t.needsReview,
      responsibilityReason: t.responsibilityReason,
      clientActionWhy: t.clientActionWhy,
      segments: t.segments,
      summary: t.summary,
      highlights: t.importantHighlights,
      extractedDates: t.extractedDates,
      latestMessage: t.messages[t.messages.length - 1]?.body.slice(0, 450),
    }));
}

export async function chatWithAssistant(options: {
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  roleId: ChatRoleId;
  threads: EmailThread[];
  activeThreadId?: string;
  assistantName: string;
  clientName: string;
}): Promise<ChatReplyPayload> {
  const ai = getGeminiClient();
  const snapshot = buildCompactInboxSnapshot(options.threads);
  const activeThread = options.threads.find(
    (t) => t.id === options.activeThreadId
  );

  const roleConfig: Record<
    ChatRoleId,
    { model: string; persona: string; thinkingLevel?: ThinkingLevel }
  > = {
    strategist: {
      model: MODEL_NAME,
      thinkingLevel: ThinkingLevel.HIGH,
      persona: `You are the RelayDesk Executive Triage Strategist supporting Personal Assistant ${options.assistantName} and Executive Client ${options.clientName}. Provide thoughtful, structured prioritization, explain why conversations belong to the Assistant vs. Client, spot risks or approaching deadlines, and recommend clear next steps.`,
    },
    drafter: {
      model: MODEL_NAME,
      thinkingLevel: ThinkingLevel.LOW,
      persona: `You are the RelayDesk Executive Drafting & Tone Advisor for ${options.assistantName} and ${options.clientName}. Help refine email phrasing, adjust tone (concise, warm, firm, formal), and compose crisp replies ready for human approval.`,
    },
    fast: {
      model: FAST_MODEL_NAME,
      persona: `You are the RelayDesk Rapid Inbox Lookup assistant for ${options.assistantName}. Answer in ultra-crisp, scannable bullets with exact sender names, dates, and status—no fluff.`,
    },
  };

  const selected = roleConfig[options.roleId] || roleConfig.strategist;

  const systemInstruction = `${selected.persona}

LIVE INBOX CONTEXT (${snapshot.length} non-archived conversations):
${JSON.stringify(snapshot)}

CURRENTLY OPEN CONVERSATION:
${activeThread ? `${activeThread.id} — "${activeThread.subject}" from ${activeThread.primarySenderName} (${activeThread.responsibility})` : 'None selected'}

Rules:
- Base all answers strictly on the live inbox data above; never invent emails or dates.
- When referencing a specific email conversation, naturally mention its subject or sender name so the user knows which thread you mean.`;

  const chat = ai.chats.create({
    model: selected.model,
    config: {
      systemInstruction,
      ...(selected.thinkingLevel
        ? { thinkingConfig: { thinkingLevel: selected.thinkingLevel } }
        : {}),
    },
    history: options.history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
  });

  const response = await chat.sendMessage({ message: options.message });
  const replyText = (response.text ?? '').trim() || 'No response generated.';

  // Match any threads referenced by subject or sender name for clickable citations
  const lowerReply = replyText.toLowerCase();
  const citations = options.threads
    .filter(
      (t) =>
        !t.isArchived &&
        (lowerReply.includes(t.primarySenderName.toLowerCase()) ||
          lowerReply.includes(t.subject.slice(0, 22).toLowerCase()))
    )
    .slice(0, 4)
    .map((t) => ({
      threadId: t.id,
      subject: t.subject,
      senderName: t.primarySenderName,
      responsibility: t.responsibility,
    }));

  return {
    reply: replyText,
    modelUsed: selected.model,
    citations,
  };
}

export function buildLiveVoiceSystemInstruction(
  threads: EmailThread[],
  assistantName: string,
  clientName: string
): string {
  const active = threads.filter((t) => !t.isArchived && !t.isCompleted);
  const clientItems = active
    .filter((t) => t.responsibility === 'CLIENT_TO_REPLY')
    .map(
      (t) =>
        `- "${t.subject}" from ${t.primarySenderName} (${t.primarySenderCompany || t.provider}): ${t.clientActionWhy || t.summary}`
    )
    .join('\n');

  const assistantItems = active
    .filter((t) => t.responsibility === 'ASSISTANT_TO_REPLY')
    .map(
      (t) =>
        `- "${t.subject}" from ${t.primarySenderName}: ${t.summary}`
    )
    .join('\n');

  const reviewItems = active
    .filter((t) => t.needsReview)
    .map((t) => `- "${t.subject}" from ${t.primarySenderName}: ${t.responsibilityReason}`)
    .join('\n');

  return `You are RelayDesk Voice, a calm, sharp executive voice briefing partner for Personal Assistant ${assistantName} and Executive Client ${clientName}.
Speak naturally, concisely, and conversationally—avoid reading out raw IDs or formatting symbols.

Current Inbox Snapshot (${active.length} active threads):

Client to Reply (${active.filter((t) => t.responsibility === 'CLIENT_TO_REPLY').length}):
${clientItems || 'None right now.'}

Assistant to Reply (${active.filter((t) => t.responsibility === 'ASSISTANT_TO_REPLY').length}):
${assistantItems || 'None right now.'}

Flagged for Review:
${reviewItems || 'None right now.'}

Help the user triage, summarize threads, recall deadlines, or brainstorm reply wording out loud.`;
}

