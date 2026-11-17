import { Mic, MicOff, PhoneOff, Radio, Send, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TranscriptEntry {
  id: string;
  speaker: 'you' | 'assistant' | 'system';
  text: string;
}

type VoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

function floatTo16BitBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function LiveVoicePanel() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>(
    'idle'
  );
  const [voiceName, setVoiceName] = useState<VoiceName>('Zephyr');
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [textNudge, setTextNudge] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Refs for audio callbacks to avoid stale closures
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mutedRef = useRef<boolean>(false);
  const statusRef = useRef<'idle' | 'connecting' | 'live' | 'error'>('idle');

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const stopScheduledAudio = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore stopped node errors
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const cleanupSession = () => {
    stopScheduledAudio();
    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore
    }
    processorRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      inputCtxRef.current?.close();
    } catch {
      // Ignore
    }
    inputCtxRef.current = null;

    try {
      outputCtxRef.current?.close();
    } catch {
      // Ignore
    }
    outputCtxRef.current = null;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
  };

  useEffect(() => {
    return () => cleanupSession();
  }, []);

  const appendTranscript = (
    speaker: TranscriptEntry['speaker'],
    chunk: string
  ) => {
    const clean = chunk;
    if (!clean) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker && speaker !== 'system') {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${clean}` },
        ];
      }
      return [
        ...prev,
        { id: `tr-${Date.now()}-${Math.random()}`, speaker, text: clean },
      ];
    });
  };

  const playPcmChunk = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const floatData = base64PcmToFloat32(base64Audio);
    if (floatData.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, floatData.length, 24000);
    audioBuffer.getChannelData(0).set(floatData);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const startVoiceSession = async () => {
    if (status === 'connecting' || status === 'live') return;
    setErrorMsg(null);
    setStatus('connecting');
    setTranscript([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${wsProto}//${location.host}/live?voice=${encodeURIComponent(voiceName)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const base64 = floatTo16BitBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            error?: string;
            closed?: boolean;
          };

          if (msg.ready) {
            setStatus('live');
            appendTranscript(
              'system',
              `Connected to Gemini Live (${voiceName}). Speak naturally to review your inbox.`
            );
          }
          if (msg.inputTranscript) {
            appendTranscript('you', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            appendTranscript('assistant', msg.outputTranscript);
          }
          if (msg.audio) {
            playPcmChunk(msg.audio);
          }
          if (msg.interrupted) {
            stopScheduledAudio();
          }
          if (msg.error) {
            setErrorMsg(msg.error);
            setStatus('error');
            cleanupSession();
          }
          if (msg.closed) {
            setStatus('idle');
            cleanupSession();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMsg('WebSocket connection to Live Voice server failed.');
        setStatus('error');
        cleanupSession();
      };

      ws.onclose = () => {
        if (statusRef.current !== 'error') {
          setStatus('idle');
        }
      };
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Microphone permission is required for live voice conversations.'
      );
      setStatus('error');
      cleanupSession();
    }
  };

  const endVoiceSession = () => {
    cleanupSession();
    setStatus('idle');
  };

  const sendTextToLive = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textNudge.trim();
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: trimmed }));
    appendTranscript('you', trimmed);
    setTextNudge('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-slate-200 space-y-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-900">
              Real-Time Voice Briefing (Gemini Live)
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Model: gemini-3.8-live · 16kHz mic / 24kHz audio
            </p>
          </div>

          <select
            value={voiceName}
            disabled={status === 'live' || status === 'connecting'}
            onChange={(e) => setVoiceName(e.target.value as VoiceName)}
            aria-label="Voice persona"
            className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 disabled:opacity-60"
          >
            <option value="Zephyr">Voice: Zephyr</option>
            <option value="Kore">Voice: Kore</option>
            <option value="Puck">Voice: Puck</option>
            <option value="Charon">Voice: Charon</option>
            <option value="Fenrir">Voice: Fenrir</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {status === 'live' || status === 'connecting' ? (
            <>
              <button
                type="button"
                onClick={() => setMuted(!muted)}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border transition-colors ${
                  muted
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                }`}
              >
                {muted ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Mic Muted</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-blue-700" />
                    <span>Listening (Mute)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={endVoiceSession}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startVoiceSession}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              <Radio className="w-4 h-4" />
              <span>Start Live Voice Conversation</span>
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Live Transcript */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 thin-scrollbar">
        {transcript.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <Volume2 className="w-7 h-7 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">
                Hands-free executive briefing
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                Start a voice session to ask about urgent client decisions,
                upcoming travel, or brainstorm reply wording out loud.
              </p>
            </div>
          </div>
        ) : (
          transcript.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                item.speaker === 'system'
                  ? 'bg-slate-50 border border-slate-200 text-slate-600'
                  : item.speaker === 'you'
                    ? 'bg-blue-50 border border-blue-200 text-slate-900 ml-6'
                    : 'bg-white border border-slate-200 text-slate-800 mr-6'
              }`}
            >
              {item.speaker !== 'system' && (
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                  {item.speaker === 'you' ? 'You' : 'RelayDesk Voice'}
                </span>
              )}
              <span>{item.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Optional text nudge during live voice session */}
      {status === 'live' && (
        <form
          onSubmit={sendTextToLive}
          className="p-4 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={textNudge}
            onChange={(e) => setTextNudge(e.target.value)}
            placeholder="Or type a message into the live voice session..."
            className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={!textNudge.trim()}
            aria-label="Send text to voice session"
            className="p-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
