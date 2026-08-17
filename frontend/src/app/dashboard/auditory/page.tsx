"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { auditoryQuery, auditoryQueryStream } from "@/lib/api";

// ─── Web Speech API type shims ─────────────────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
  item(index: number): SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart:  (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror:  ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend:    (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type Phase = "idle" | "listening" | "thinking" | "generating" | "speaking";

interface Message {
  sender: "user" | "tutor";
  text: string;
}

export default function AuditoryTutorPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveText, setLiveText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [voice, setVoice] = useState<string>("default");
  // ── Word-highlighting state ───────────────────────────────────────────────
  const [narrating, setNarrating] = useState<{ msgIdx: number; wordIdx: number } | null>(null);

  // ── All refs — these never go stale inside callbacks ───────────────────────
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef  = useRef<string | null>(null);
  const recognitionRef   = useRef<SpeechRecognitionInstance | null>(null);
  const speechTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferRef        = useRef<string>("");
  const messagesEndRef   = useRef<HTMLDivElement | null>(null);
  const wordTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Refs that mirror state so callbacks always see fresh values ────────────
  const phaseRef  = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const voiceRef  = useRef<string>("default");
  const messagesRef = useRef<Message[]>([]);

  phaseRef.current  = phase;
  activeRef.current = active;
  voiceRef.current  = voice;
  messagesRef.current = messages;

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
      recognitionRef.current?.abort();
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Stop audio helper (pure ref-based, no stale closure) ──────────────────
  const stopAudio = useCallback(() => {
    // Cancel browser TTS if active
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (wordTimerRef.current) { clearInterval(wordTimerRef.current); wordTimerRef.current = null; }
    setNarrating(null);
    if (audioRef.current) {
      audioRef.current.onplay      = null;
      audioRef.current.onended     = null;
      audioRef.current.onerror     = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
  }, []);

  // ── Stop recognition helper ───────────────────────────────────────────────
  const stopRecognition = useCallback(() => {
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onstart  = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror  = null;
      recognitionRef.current.onend    = null;
      try { recognitionRef.current.abort(); } catch { /* */ }
      recognitionRef.current = null;
    }
    bufferRef.current = "";
    setLiveText("");
  }, []);

  // ── Forward declarations using ref trick ──────────────────────────────────
  const startListeningRef = useRef<() => void>(() => {});
  const askTutorRef       = useRef<(q: string) => void>(() => {});

  // ── Speak ─────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, onDone?: () => void, msgIdx?: number, append?: boolean) => {
    if (!append) stopAudio();
    
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setPhase("idle");
      onDone?.();
      return;
    }

    // A tiny delay to ensure React state has settled before we speak
    await new Promise(r => setTimeout(r, 50));
    
    if (!activeRef.current) return;

    const utt     = new SpeechSynthesisUtterance(text);
    utt.rate      = 1.0;
    utt.pitch     = 1.0;
    
    // We can simulate word highlighting using the `onboundary` event
    const words = text.trim().split(/\s+/);
    let currentWordIdx = 0;

    utt.onboundary = (e) => {
      if (e.name === 'word' && msgIdx !== undefined) {
        setNarrating({ msgIdx, wordIdx: currentWordIdx });
        currentWordIdx = Math.min(currentWordIdx + 1, words.length - 1);
      }
    };
    
    utt.onstart   = () => { setPhase("speaking"); };
    utt.onend     = () => { 
      setNarrating(null);
      setPhase("idle"); 
      stopRecognition(); 
      onDone?.(); 
    };
    utt.onerror = () => {
      setNarrating(null);
      setPhase("idle");
      stopRecognition();
      onDone?.();
    };
    
    window.speechSynthesis.speak(utt);
  }, [stopAudio, stopRecognition]);

  // ── Ask tutor ─────────────────────────────────────────────────────────────
  const askTutor = useCallback(async (query: string) => {
    if (!query.trim()) return;

    // Stop everything first (audio + mic)
    stopAudio();
    stopRecognition();

    setError("");
    setPhase("thinking");
    setMessages(prev => [...prev, { sender: "user", text: query }]);

    try {
      const history = messagesRef.current.map(m => ({
        role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.text
      }));

      let currentAnswer = "";
      let sentenceBuffer = "";
      let targetIdx = -1;

      setMessages(prev => {
        targetIdx = prev.length;
        return [...prev, { sender: "tutor", text: "" }];
      });

      const playQueue: string[] = [];
      let isPlaying = false;
      let interrupted = false;

      const playNext = async () => {
        if (interrupted || phaseRef.current === "listening") {
          interrupted = true;
          return;
        }
        if (isPlaying || playQueue.length === 0) return;
        isPlaying = true;
        const sentence = playQueue.shift()!;
        
        await new Promise<void>(resolve => {
          speak(sentence, () => {
            isPlaying = false;
            resolve();
            playNext();
          }, targetIdx, true); // append=true to prevent stopping the audio engine if it's hot
        });
      };

      await auditoryQueryStream(query, history, {
        onToken: (text) => {
          if (interrupted || phaseRef.current === "listening") {
            interrupted = true;
            return;
          }
          // Change phase from "thinking" to "speaking" as soon as we start getting tokens
          if (phaseRef.current === "thinking") {
            setPhase("speaking");
          }

          currentAnswer += text;
          sentenceBuffer += text;

          setMessages(prev => {
            const next = [...prev];
            next[targetIdx] = { sender: "tutor", text: currentAnswer };
            return next;
          });

          // Match end of sentence or newlines
          const match = sentenceBuffer.match(/([.!?]\s+|\n+)/);
          if (match) {
            const splitIdx = match.index! + match[0].length;
            const sentence = sentenceBuffer.substring(0, splitIdx).trim();
            sentenceBuffer = sentenceBuffer.substring(splitIdx);
            
            if (sentence) {
              playQueue.push(sentence);
              playNext();
            }
          }
        },
        onDone: () => {
          if (interrupted || phaseRef.current === "listening") return;
          
          if (sentenceBuffer.trim()) {
            playQueue.push(sentenceBuffer.trim());
            playNext();
          }
          
          const checkDone = setInterval(() => {
            if (phaseRef.current === "listening") {
              clearInterval(checkDone);
              return;
            }
            if (playQueue.length === 0 && !isPlaying) {
              clearInterval(checkDone);
              if (activeRef.current && phaseRef.current === "idle") {
                startListeningRef.current();
              }
            }
          }, 300);
        },
        onError: (detail) => {
          if (interrupted || phaseRef.current === "listening") return;
          setError(detail);
          setPhase("idle");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get response.");
      setPhase("idle");
    }
  }, [speak, stopAudio, stopRecognition]);

  // Keep ref up to date
  askTutorRef.current = askTutor;

  // ── Start listening ────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SpeechRec = (typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

    if (!SpeechRec) {
      setError("Your browser doesn't support voice input. Please use Chrome.");
      return;
    }

    // Tear down any previous instance cleanly
    stopRecognition();

    const rec = new SpeechRec();
    rec.lang           = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous     = true;

    rec.onstart = () => {
      // Only show "listening" visually if we're not already speaking
      // (when speaking we're silently monitoring for interruption)
      if (phaseRef.current === "idle") {
        setPhase("listening");
      }
      bufferRef.current = "";
      setLiveText("");
    };

    rec.onresult = (e) => {
      let interim = "";
      let final   = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final   += e.results[i][0].transcript + " ";
        else                      interim += e.results[i][0].transcript;
      }

      if (final) bufferRef.current += final;

      const total = (bufferRef.current + interim).trim();
      if (!total) return;

      // ── BARGE-IN: user spoke while AI was talking ──
      if (phaseRef.current === "speaking" || phaseRef.current === "generating") {
        stopAudio();
        setPhase("listening");
      }

      setLiveText(total);

      // Reset silence timer
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);

      speechTimerRef.current = setTimeout(() => {
        const submitText = bufferRef.current.trim() || interim.trim();
        if (submitText && activeRef.current) {
          // Use ref so we don't capture a stale `askTutor`
          askTutorRef.current(submitText);
        }
      }, 3000);
    };

    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("SpeechRecognition error:", e.error);
      }
      if (phaseRef.current === "listening") setPhase("idle");
    };

    rec.onend = () => {
      // If we're still meant to be idle & active, auto-restart to keep session alive
      if (activeRef.current && phaseRef.current === "idle") {
        setTimeout(() => startListeningRef.current(), 200);
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [stopAudio, stopRecognition]);

  // Keep ref up to date
  startListeningRef.current = startListening;

  // ── Toggle session ─────────────────────────────────────────────────────────
  const toggleSession = useCallback(() => {
    if (!active) {
      setActive(true);
      activeRef.current = true;
      setMessages([]);
      setError("");
      // Small delay to ensure state is flushed before starting
      setTimeout(() => startListeningRef.current(), 50);
    } else {
      setActive(false);
      activeRef.current = false;
      stopAudio();
      stopRecognition();
      setPhase("idle");
      setLiveText("");
    }
  }, [active, stopAudio, stopRecognition]);

  // ── Tap orb handler ────────────────────────────────────────────────────────
  const handleOrbTap = useCallback(() => {
    if (!active) { toggleSession(); return; }
    if (phase === "listening") {
      // Tap while listening = force-submit whatever they said
      if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
      const text = bufferRef.current.trim();
      if (text) askTutorRef.current(text);
      else      stopRecognition();
    } else if (phase === "speaking" || phase === "generating") {
      stopAudio();
      stopRecognition();
      setPhase("idle");
      setTimeout(() => { if (activeRef.current) startListeningRef.current(); }, 100);
    } else if (phase === "idle") {
      startListeningRef.current();
    }
  }, [active, phase, stopAudio, stopRecognition, toggleSession]);

  // ── Visual constants ───────────────────────────────────────────────────────
  const orbColors: Record<Phase, string> = {
    idle:       "radial-gradient(circle at 40% 35%, #a78bfa, #7c3aed 55%, #312e81 100%)",
    listening:  "radial-gradient(circle at 40% 35%, #34d399, #059669 55%, #064e3b 100%)",
    thinking:   "radial-gradient(circle at 40% 35%, #fbbf24, #d97706 55%, #78350f 100%)",
    generating: "radial-gradient(circle at 40% 35%, #f472b6, #db2777 55%, #831843 100%)",
    speaking:   "radial-gradient(circle at 40% 35%, #60a5fa, #2563eb 55%, #1e3a8a 100%)",
  };

  const statusLabels: Record<Phase, string> = {
    idle:       active ? "Tap to speak" : "Tap to start",
    listening:  "Listening… (3s silence to send)",
    thinking:   "Thinking…",
    generating: "Generating voice…",
    speaking:   "Speaking… (Talk to interrupt)",
  };

  const ringScale = phase === "listening" ? 1.25 : phase === "speaking" ? 1.18 : phase === "generating" ? 1.12 : 1.05;

  return (
    <>
      <style>{`
        @keyframes siri-ripple {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes orb-breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.045); }
        }
        @keyframes thinking-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fade-slide-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-enter { animation: fade-slide-up 0.3s ease forwards; }
        .orb-shadow-idle      { box-shadow: 0 0 60px 20px rgba(124,58,237,0.35), 0 0 120px 60px rgba(124,58,237,0.12); }
        .orb-shadow-listening  { box-shadow: 0 0 60px 20px rgba(5,150,105,0.45), 0 0 120px 60px rgba(5,150,105,0.15); }
        .orb-shadow-thinking   { box-shadow: 0 0 60px 20px rgba(217,119,6,0.45), 0 0 120px 60px rgba(217,119,6,0.15); }
        .orb-shadow-generating { box-shadow: 0 0 60px 20px rgba(219,39,119,0.45), 0 0 120px 60px rgba(219,39,119,0.15); }
        .orb-shadow-speaking   { box-shadow: 0 0 60px 20px rgba(37,99,235,0.45), 0 0 120px 60px rgba(37,99,235,0.15); }
      `}</style>

      <div style={{
        minHeight: "calc(100vh - 60px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "2rem",
        gap: "2rem",
        width: "100%",
        maxWidth: "680px",
      }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "0.72rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
            CognifyAI · Auditory Mode
          </p>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text-primary)", margin: 0 }}>
            Voice Tutor
          </h1>
          {active && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
              🎧 Wear headphones — speak anytime to interrupt the AI.
            </p>
          )}
        </div>

        {/* ── Siri Orb ── */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "240px", height: "240px" }}>

          {(phase === "listening" || phase === "speaking") && [0, 1].map((i) => (
            <div key={i} style={{
              position: "absolute",
              width: "200px",
              height: "200px",
              borderRadius: "50%",
              background: phase === "listening" ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
              animation: `siri-ripple 1.8s ease-out ${i * 0.6}s infinite`,
              pointerEvents: "none",
            }} />
          ))}

          <div style={{
            position: "absolute",
            width: `${ringScale * 180}px`,
            height: `${ringScale * 180}px`,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.08)",
            transition: "width 0.4s ease, height 0.4s ease",
            pointerEvents: "none",
          }} />

          <button
            onClick={handleOrbTap}
            aria-label={statusLabels[phase]}
            style={{
              width: "160px",
              height: "160px",
              borderRadius: "50%",
              border: "none",
              cursor: phase === "thinking" ? "wait" : "pointer",
              background: orbColors[phase],
              transition: "background 0.5s ease, transform 0.15s ease",
              position: "relative",
              zIndex: 1,
              animation: phase === "thinking" ? "none" : "orb-breathe 3s ease-in-out infinite",
            }}
            className={`orb-shadow-${phase}`}
          >
            {phase === "thinking" && (
              <div style={{
                position: "absolute", inset: "-6px", borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: "#fbbf24", borderRightColor: "#fbbf24",
                animation: "thinking-spin 0.9s linear infinite",
              }} />
            )}

            <svg viewBox="0 0 40 40" fill="none" style={{ width: 48, height: 48 }}>
              {phase === "idle" && !active && (
                <polygon points="14,10 30,20 14,30" fill="rgba(255,255,255,0.9)" />
              )}
              {(phase === "idle" && active) || phase === "listening" ? (
                <>
                  <rect x="15" y="8" width="10" height="18" rx="5" fill="white"/>
                  <path d="M10 24a10 10 0 0020 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                  <line x1="20" y1="34" x2="20" y2="39" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                </>
              ) : null}
              {phase === "thinking" && (
                <>
                  <circle cx="12" cy="20" r="3" fill="rgba(255,255,255,0.9)"/>
                  <circle cx="20" cy="20" r="3" fill="rgba(255,255,255,0.9)"/>
                  <circle cx="28" cy="20" r="3" fill="rgba(255,255,255,0.9)"/>
                </>
              )}
              {(phase === "speaking" || phase === "generating") && (
                <path d="M14 14v12M18 11v18M22 13v14M26 16v8" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
              )}
            </svg>
          </button>
        </div>

        {/* ── Status label ── */}
        <div style={{ textAlign: "center", minHeight: "2.8rem" }}>
          <p style={{
            fontSize: "1.05rem",
            fontWeight: 600,
            color: phase === "listening" ? "#34d399"
                 : phase === "thinking"  ? "#fbbf24"
                 : phase === "speaking"  ? "#60a5fa"
                 : "var(--text-secondary)",
            transition: "color 0.3s ease",
            margin: 0,
          }}>
            {statusLabels[phase]}
          </p>
          {liveText && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.3rem", fontStyle: "italic", maxWidth: "400px" }}>
              &ldquo;{liveText}&rdquo;
            </p>
          )}
        </div>

        {/* ── Voice picker ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Voice</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={phase === "speaking"}
            style={{
              padding: "0.3rem 0.65rem",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--surface, rgba(255,255,255,0.04))",
              color: "var(--text-primary)",
              fontSize: "0.78rem",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="default">System Default Voice</option>
          </select>
        </div>

        {/* ── Session toggle ── */}
        {active ? (
          <button
            onClick={toggleSession}
            style={{
              padding: "0.5rem 1.5rem", borderRadius: "999px",
              border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)",
              color: "#f87171", fontSize: "0.82rem", fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.02em", transition: "background 0.2s",
            }}
          >
            End Session
          </button>
        ) : (
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", maxWidth: "280px", lineHeight: 1.6 }}>
            Tap the orb to start. Speak your question — the AI tutor will answer you out loud.
          </p>
        )}

        {error && (
          <div style={{
            padding: "0.65rem 1rem", borderRadius: "8px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171", fontSize: "0.8rem", maxWidth: "480px", width: "100%",
          }}>
            {error}
          </div>
        )}

        {/* ── Conversation log ── */}
        {messages.length > 0 && (
          <div style={{
            width: "100%", maxWidth: "580px", display: "flex",
            flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem",
            maxHeight: "36vh", overflowY: "auto", paddingRight: "4px",
          }}>
            {messages.map((m, i) => (
              <div
                key={i}
                className="msg-enter"
                style={{ display: "flex", flexDirection: m.sender === "user" ? "row-reverse" : "row", gap: "0.5rem", alignItems: "flex-end" }}
              >
                <div style={{
                  width: "30px", height: "30px", borderRadius: "50%",
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem",
                  background: m.sender === "tutor" ? "radial-gradient(circle, #7c3aed, #4c1d95)" : "var(--surface-2, rgba(255,255,255,0.06))",
                  border: "1px solid var(--border)",
                }}>
                  {m.sender === "tutor" ? "✦" : "↑"}
                </div>
                <div style={{
                  maxWidth: "78%", padding: "0.65rem 0.9rem",
                  borderRadius: m.sender === "user" ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
                  background: m.sender === "tutor" ? "rgba(124,58,237,0.1)" : "var(--surface-2, rgba(255,255,255,0.06))",
                  border: "1px solid var(--border)", fontSize: "0.88rem", lineHeight: 1.65, color: "var(--text-primary)",
                }}>
                  {/* ── Word-highlighting render for tutor messages ── */}
                  {m.sender === "tutor" && narrating?.msgIdx === i ? (
                    <span>
                      {m.text.trim().split(/\s+/).map((word, wi) => (
                        <span key={wi} style={{
                          display: "inline",
                          marginRight: "0.25em",
                          borderRadius: "3px",
                          padding: "0 2px",
                          transition: "background 0.1s, color 0.1s",
                          background: wi === narrating.wordIdx ? "rgba(251,191,36,0.35)" : "transparent",
                          color: wi === narrating.wordIdx ? "#fde68a" : "inherit",
                          fontWeight: wi === narrating.wordIdx ? 600 : "inherit",
                        }}>{word}</span>
                      ))}
                    </span>
                  ) : (
                    m.text
                  )}
                  {m.sender === "tutor" && (
                    <button
                      onClick={() => speak(m.text, undefined, i)}
                      style={{ display: "block", marginTop: "0.4rem", fontSize: "0.7rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      ↺ Replay
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </>
  );
}
