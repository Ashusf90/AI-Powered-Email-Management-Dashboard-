import 'dotenv/config';
import { Modality, type LiveServerMessage } from '@google/genai';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import {
  analyzeEmailThread,
  askInboxCopilot,
  buildLiveVoiceSystemInstruction,
  chatWithAssistant,
  draftEmailReply,
  getGeminiClient,
} from './server/aiService.ts';
import { createInitialWorkspaceState } from './server/seedData.ts';
import type {
  ChatRoleId,
  ConnectedAccount,
  EmailProvider,
  EmailThread,
  Responsibility,
  WorkspaceState,
} from './src/types/email.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_PATH = path.resolve('/tmp', 'relaydesk-workspace.json');

function loadState(): WorkspaceState {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (parsed && Array.isArray(parsed.threads) && Array.isArray(parsed.accounts)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not load persisted workspace store, using seed data:', err);
  }
  return createInitialWorkspaceState();
}

function saveState(state: WorkspaceState): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist workspace state to disk:', err);
  }
}

let workspace: WorkspaceState = loadState();

function recomputeAccountCounts(): void {
  for (const acc of workspace.accounts) {
    const accThreads = workspace.threads.filter(
      (t) => t.accountId === acc.id && !t.isArchived
    );
    acc.unreadCount = accThreads.filter((t) => t.isUnread).length;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, threads: workspace.threads.length });
  });

  // Get full workspace state
  app.get('/api/workspace', (_req, res) => {
    recomputeAccountCounts();
    res.json(workspace);
  });

  // Reset workspace to initial realistic demo state
  app.post('/api/workspace/reset', (_req, res) => {
    workspace = createInitialWorkspaceState();
    workspace.session.signedIn = true;
    workspace.session.onboardingCompleted = true;
    recomputeAccountCounts();
    saveState(workspace);
    res.json(workspace);
  });

  // Onboarding: sign in / sign up
  app.post('/api/session/login', (req, res) => {
    const { assistantName, assistantEmail, clientName, clientEmail } = req.body as {
      assistantName?: string;
      assistantEmail?: string;
      clientName?: string;
      clientEmail?: string;
    };

    workspace.session = {
      ...workspace.session,
      signedIn: true,
      assistantName: assistantName?.trim() || workspace.session.assistantName,
      assistantEmail: assistantEmail?.trim() || workspace.session.assistantEmail,
      clientName: clientName?.trim() || workspace.session.clientName,
      clientEmail: clientEmail?.trim() || workspace.session.clientEmail,
    };
    saveState(workspace);
    res.json(workspace);
  });

  app.post('/api/session/complete-onboarding', (_req, res) => {
    workspace.session.signedIn = true;
    workspace.session.onboardingCompleted = true;
    saveState(workspace);
    res.json(workspace);
  });

  // Connect or reconnect an email account (simulated OAuth flow)
  app.post('/api/accounts/connect', (req, res) => {
    const { provider, email, displayName } = req.body as {
      provider: EmailProvider;
      email: string;
      displayName?: string;
    };

    if (!provider || !email?.trim()) {
      return res.status(400).json({ error: 'Provider and email address are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = workspace.accounts.find(
      (a) => a.email.toLowerCase() === normalizedEmail
    );

    if (existing) {
      existing.status = 'connected';
      existing.lastSyncedAt = new Date().toISOString();
      if (displayName?.trim()) existing.displayName = displayName.trim();
    } else {
      const newAccount: ConnectedAccount = {
        id: `acc-${provider}-${Date.now()}`,
        provider,
        email: normalizedEmail,
        displayName:
          displayName?.trim() ||
          `${workspace.session.clientName} · ${provider === 'gmail' ? 'Gmail' : 'Outlook'}`,
        status: 'connected',
        lastSyncedAt: new Date().toISOString(),
        unreadCount: 0,
        totalSynced: 128,
      };
      workspace.accounts.push(newAccount);
    }

    recomputeAccountCounts();
    saveState(workspace);
    res.json(workspace);
  });

  // Sync an account
  app.post('/api/accounts/:id/sync', (req, res) => {
    const account = workspace.accounts.find((a) => a.id === req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    account.status = 'connected';
    account.lastSyncedAt = new Date().toISOString();
    recomputeAccountCounts();
    saveState(workspace);
    res.json(workspace);
  });

  // Disconnect an account
  app.delete('/api/accounts/:id', (req, res) => {
    const idx = workspace.accounts.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    workspace.accounts[idx].status = 'disconnected';
    saveState(workspace);
    res.json(workspace);
  });

  // Update thread properties (manual responsibility change, read/important/archive/complete, client handoff)
  app.patch('/api/threads/:id', (req, res) => {
    const thread = workspace.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    const body = req.body as Partial<EmailThread> & {
      manualResponsibilityReason?: string;
    };

    if (typeof body.isUnread === 'boolean') thread.isUnread = body.isUnread;
    if (typeof body.isImportant === 'boolean') thread.isImportant = body.isImportant;
    if (typeof body.isArchived === 'boolean') thread.isArchived = body.isArchived;
    if (typeof body.isCompleted === 'boolean') {
      thread.isCompleted = body.isCompleted;
      if (body.isCompleted) {
        thread.responsibility = 'NO_REPLY_NEEDED';
        thread.needsReview = false;
        thread.segments = thread.segments.filter((s) => s !== 'Action Required');
        if (thread.segments.length === 0) thread.segments.push('General');
      }
    }
    if (typeof body.needsReview === 'boolean') thread.needsReview = body.needsReview;
    if (typeof body.clientDelegationNote === 'string') {
      thread.clientDelegationNote = body.clientDelegationNote;
    }

    if (body.responsibility) {
      thread.responsibility = body.responsibility;
      thread.responsibilityLockedByHuman = true;
      thread.needsReview = false;
      if (body.manualResponsibilityReason) {
        thread.responsibilityReason = body.manualResponsibilityReason;
      } else if (body.responsibility === 'ASSISTANT_TO_REPLY') {
        thread.responsibilityReason = body.clientDelegationNote
          ? `Delegated by ${workspace.session.clientName}: "${body.clientDelegationNote}"`
          : `Manually assigned to ${workspace.session.assistantName} for response.`;
      } else if (body.responsibility === 'CLIENT_TO_REPLY') {
        thread.responsibilityReason = `Flagged for ${workspace.session.clientName}'s personal response.`;
        if (!thread.clientActionWhy) {
          thread.clientActionWhy = `Assigned for your personal attention by ${workspace.session.assistantName}.`;
        }
      } else {
        thread.responsibilityReason = 'Marked as no reply required.';
      }
    }

    recomputeAccountCounts();
    saveState(workspace);
    res.json({ thread, workspace });
  });

  // Re-analyze an existing thread with Gemini AI
  app.post('/api/threads/:id/analyze', async (req, res) => {
    const thread = workspace.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    try {
      const analysis = await analyzeEmailThread(
        thread,
        workspace.session.assistantName,
        workspace.session.clientName
      );
      thread.responsibility = analysis.responsibility;
      thread.responsibilityLockedByHuman = false;
      thread.needsReview = analysis.needsReview;
      thread.confidence = analysis.confidence;
      thread.responsibilityReason = analysis.responsibilityReason;
      thread.clientActionWhy = analysis.clientActionWhy;
      thread.summary = analysis.summary;
      thread.importantHighlights = analysis.importantHighlights;
      thread.segments = analysis.segments;
      thread.extractedDates = analysis.extractedDates;

      recomputeAccountCounts();
      saveState(workspace);
      res.json({ thread, workspace });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI analysis failed.';
      console.error('Analyze thread error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Simulate a new incoming reply in an existing thread -> triggers automatic Gemini re-classification!
  app.post('/api/threads/:id/simulate-reply', async (req, res) => {
    const thread = workspace.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    const { senderName, senderEmail, body } = req.body as {
      senderName?: string;
      senderEmail?: string;
      body?: string;
    };

    if (!body?.trim()) {
      return res.status(400).json({ error: 'Incoming message body is required.' });
    }

    const newMsg = {
      id: `msg-${Date.now()}`,
      senderName: senderName?.trim() || thread.primarySenderName,
      senderEmail: senderEmail?.trim() || thread.primarySenderEmail,
      recipientEmail: workspace.session.clientEmail,
      sentAt: new Date().toISOString(),
      body: body.trim(),
    };

    thread.messages.push(newMsg);
    thread.lastMessageAt = newMsg.sentAt;
    thread.isUnread = true;
    thread.isCompleted = false;
    thread.isArchived = false;

    try {
      const analysis = await analyzeEmailThread(
        thread,
        workspace.session.assistantName,
        workspace.session.clientName
      );
      thread.responsibility = analysis.responsibility;
      thread.responsibilityLockedByHuman = false;
      thread.needsReview = analysis.needsReview;
      thread.confidence = analysis.confidence;
      thread.responsibilityReason = analysis.responsibilityReason;
      thread.clientActionWhy = analysis.clientActionWhy;
      thread.summary = analysis.summary;
      thread.importantHighlights = analysis.importantHighlights;
      thread.segments = analysis.segments;
      thread.extractedDates = analysis.extractedDates;

      recomputeAccountCounts();
      saveState(workspace);
      res.json({ thread, workspace });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'AI re-classification failed.';
      // Still save the incoming message even if AI call returned an error
      saveState(workspace);
      res.status(500).json({ error: message, thread, workspace });
    }
  });

  // Simulate a brand-new incoming email -> automatically classified via Gemini AI
  app.post('/api/threads/simulate-incoming', async (req, res) => {
    const { senderName, senderEmail, senderCompany, subject, body, provider } =
      req.body as {
        senderName?: string;
        senderEmail?: string;
        senderCompany?: string;
        subject?: string;
        body?: string;
        provider?: EmailProvider;
      };

    if (!senderName?.trim() || !subject?.trim() || !body?.trim()) {
      return res
        .status(400)
        .json({ error: 'Sender name, subject, and body are required.' });
    }

    const targetProvider: EmailProvider = provider === 'outlook' ? 'outlook' : 'gmail';
    const matchingAccount =
      workspace.accounts.find(
        (a) => a.provider === targetProvider && a.status === 'connected'
      ) || workspace.accounts[0];

    const nowIso = new Date().toISOString();
    const newThread: EmailThread = {
      id: `thr-${Date.now()}`,
      accountId: matchingAccount?.id || 'acc-gmail-1',
      provider: targetProvider,
      subject: subject.trim(),
      participants: [
        `${senderName.trim()} <${senderEmail?.trim() || 'contact@example.com'}>`,
        `${workspace.session.clientName} <${matchingAccount?.email || workspace.session.clientEmail}>`,
      ],
      primarySenderName: senderName.trim(),
      primarySenderEmail: senderEmail?.trim() || 'contact@example.com',
      primarySenderCompany: senderCompany?.trim() || undefined,
      lastMessageAt: nowIso,
      isUnread: true,
      isImportant: false,
      isArchived: false,
      isCompleted: false,
      responsibility: 'ASSISTANT_TO_REPLY',
      responsibilityLockedByHuman: false,
      needsReview: false,
      confidence: 0.85,
      responsibilityReason: 'Analyzing incoming conversation...',
      clientActionWhy: '',
      summary: body.trim().slice(0, 160),
      importantHighlights: [],
      segments: ['Action Required'],
      extractedDates: [],
      messages: [
        {
          id: `msg-${Date.now()}`,
          senderName: senderName.trim(),
          senderEmail: senderEmail?.trim() || 'contact@example.com',
          recipientEmail: matchingAccount?.email || workspace.session.clientEmail,
          sentAt: nowIso,
          body: body.trim(),
        },
      ],
    };

    try {
      const analysis = await analyzeEmailThread(
        newThread,
        workspace.session.assistantName,
        workspace.session.clientName
      );
      newThread.responsibility = analysis.responsibility;
      newThread.needsReview = analysis.needsReview;
      newThread.confidence = analysis.confidence;
      newThread.responsibilityReason = analysis.responsibilityReason;
      newThread.clientActionWhy = analysis.clientActionWhy;
      newThread.summary = analysis.summary;
      newThread.importantHighlights = analysis.importantHighlights;
      newThread.segments = analysis.segments;
      newThread.extractedDates = analysis.extractedDates;
      if (analysis.segments.includes('Important')) {
        newThread.isImportant = true;
      }

      workspace.threads.unshift(newThread);
      if (matchingAccount) {
        matchingAccount.totalSynced += 1;
        matchingAccount.lastSyncedAt = nowIso;
      }
      recomputeAccountCounts();
      saveState(workspace);
      res.json({ thread: newThread, workspace });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'AI classification failed.';
      res.status(500).json({ error: message });
    }
  });

  // Generate AI Reply Draft
  app.post('/api/threads/:id/draft', async (req, res) => {
    const thread = workspace.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    const { authorRole, tone, instruction } = req.body as {
      authorRole?: 'assistant' | 'client';
      tone?: 'concise' | 'warm' | 'formal';
      instruction?: string;
    };

    try {
      const draft = await draftEmailReply(thread, {
        authorRole: authorRole || 'assistant',
        tone: tone || 'concise',
        instruction,
        assistantName: workspace.session.assistantName,
        clientName: workspace.session.clientName,
      });
      res.json(draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Draft generation failed.';
      console.error('Draft generation error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Approve and Send Reply
  app.post('/api/threads/:id/send', (req, res) => {
    const thread = workspace.threads.find((t) => t.id === req.params.id);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    const { body, authorRole, markCompleted, nextResponsibility } = req.body as {
      body: string;
      authorRole?: 'assistant' | 'client';
      markCompleted?: boolean;
      nextResponsibility?: Responsibility;
    };

    if (!body?.trim()) {
      return res.status(400).json({ error: 'Reply body cannot be empty.' });
    }

    const role = authorRole || 'assistant';
    const isAssistant = role === 'assistant';
    const nowIso = new Date().toISOString();

    thread.messages.push({
      id: `msg-${Date.now()}`,
      senderName: isAssistant
        ? workspace.session.assistantName
        : workspace.session.clientName,
      senderEmail: isAssistant
        ? workspace.session.assistantEmail
        : workspace.session.clientEmail,
      senderRole: isAssistant ? 'Executive Assistant' : 'Founder & Principal',
      senderAvatar: isAssistant
        ? '/src/assets/images/avatar_assistant_1794899104401.jpg'
        : '/src/assets/images/avatar_client_1794899104143.jpg',
      recipientEmail: thread.primarySenderEmail,
      sentAt: nowIso,
      body: body.trim(),
      isFromUs: true,
      sentByRole: role,
    });

    thread.lastMessageAt = nowIso;
    thread.isUnread = false;
    thread.needsReview = false;
    thread.responsibility = nextResponsibility || 'NO_REPLY_NEEDED';
    thread.responsibilityLockedByHuman = false;

    if (markCompleted) {
      thread.isCompleted = true;
      thread.responsibilityReason = 'Reply sent and conversation marked completed.';
      thread.segments = thread.segments.filter(
        (s) => s !== 'Action Required' && s !== 'Waiting for Response'
      );
      if (thread.segments.length === 0) thread.segments.push('General');
    } else {
      thread.responsibilityReason = `Reply sent by ${isAssistant ? workspace.session.assistantName : workspace.session.clientName}; waiting for recipient response.`;
      thread.segments = thread.segments.filter((s) => s !== 'Action Required');
      if (!thread.segments.includes('Waiting for Response')) {
        thread.segments.push('Waiting for Response');
      }
    }

    recomputeAccountCounts();
    saveState(workspace);
    res.json({ thread, workspace });
  });

  // Ask AI Inbox Copilot
  app.post('/api/ai/ask', async (req, res) => {
    const { question, activeThreadId } = req.body as {
      question?: string;
      activeThreadId?: string;
    };

    if (!question?.trim()) {
      return res.status(400).json({ error: 'Please enter a question.' });
    }

    try {
      const result = await askInboxCopilot(
        question.trim(),
        workspace.threads,
        activeThreadId,
        workspace.session.assistantName,
        workspace.session.clientName
      );
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI assistant query failed.';
      console.error('AI Copilot error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Multi-turn Gemini Chatbot
  app.post('/api/ai/chat', async (req, res) => {
    const { message, history, roleId, activeThreadId } = req.body as {
      message?: string;
      history?: Array<{ role: 'user' | 'model'; text: string }>;
      roleId?: ChatRoleId;
      activeThreadId?: string;
    };

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    try {
      const result = await chatWithAssistant({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        roleId: roleId || 'strategist',
        threads: workspace.threads,
        activeThreadId,
        assistantName: workspace.session.assistantName,
        clientName: workspace.session.clientName,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chat request failed.';
      console.error('AI Chat error:', err);
      res.status(500).json({ error: msg });
    }
  });

  // Vite dev middleware or static production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Real-Time Voice Conversations via Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs, req) => {
    let liveSession: Awaited<
      ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>
    > | null = null;
    let isClosed = false;

    try {
      const url = new URL(req.url || '/live', 'http://localhost');
      const requestedVoice = url.searchParams.get('voice') || 'Zephyr';
      const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
      const voiceName = allowedVoices.includes(requestedVoice)
        ? requestedVoice
        : 'Zephyr';

      const ai = getGeminiClient();
      const systemInstruction = buildLiveVoiceSystemInstruction(
        workspace.threads,
        workspace.session.assistantName,
        workspace.session.clientName
      );

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (!isClosed && clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ ready: true, voiceName }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (isClosed || clientWs.readyState !== 1) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  inputTranscript: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  outputTranscript: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live session error:', err);
            if (!isClosed && clientWs.readyState === 1) {
              clientWs.send(
                JSON.stringify({
                  error:
                    err instanceof Error
                      ? err.message
                      : 'Live voice session encountered an error.',
                })
              );
            }
          },
          onclose: () => {
            if (!isClosed && clientWs.readyState === 1) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });

      clientWs.on('message', (raw) => {
        if (isClosed || !liveSession) return;
        try {
          const payload = JSON.parse(raw.toString()) as {
            audio?: string;
            text?: string;
          };
          if (payload.audio) {
            liveSession.sendRealtimeInput({
              audio: {
                data: payload.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (payload.text) {
            liveSession.sendRealtimeInput({
              text: payload.text,
            });
          }
        } catch (err) {
          console.error('Invalid Live client message:', err);
        }
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to initialize Gemini Live session.';
      console.error('Live API connection error:', err);
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ error: msg }));
        clientWs.close();
      }
    }

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RelayDesk server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
