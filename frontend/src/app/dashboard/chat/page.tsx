"use client";
import { useState, useRef, useEffect } from "react";
import { sendChatMessage, ChatHistoryMessage, ChatSource } from "@/lib/api";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  loading?: boolean;
};

export default function ChatPage() {
  const [messages, setMessages]   = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      content: "Hi! I'm CognifyAI, your personal learning tutor. Ask me anything about the documents you've uploaded, and I'll answer based on your knowledge base.",
    },
  ]);
  const [input, setInput]         = useState("");
  const [topic, setTopic]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showSources, setShowSources] = useState<number | null>(null);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: Date.now(), role: "user", content: text };
    const thinkingMsg: Message = { id: Date.now() + 1, role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setInput("");
    setLoading(true);

    // Build history from last 10 non-loading messages
    const history: ChatHistoryMessage[] = messages
      .filter((m) => !m.loading && m.id !== 0)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await sendChatMessage({ message: text, history, topic: topic || undefined });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? { ...m, content: res.response, sources: res.sources, loading: false }
            : m
        )
      );
    } catch (e: unknown) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? { ...m, content: `❌ ${e instanceof Error ? e.message : "Something went wrong"}`, loading: false }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clear = () => {
    setMessages([{
      id: 0,
      role: "assistant",
      content: "Chat cleared. Ask me anything about your documents!",
    }]);
    setShowSources(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 5rem)", maxWidth: "860px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexShrink: 0 }}>
        <div>
          <h1>Chat with Your Docs</h1>
          <p style={{ marginTop: "0.2rem", fontSize: "0.875rem" }}>
            Ask anything — answers are grounded in your uploaded knowledge base.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <input
            className="input"
            style={{ width: "160px", fontSize: "0.8rem" }}
            placeholder="Filter topic (optional)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button className="btn btn-outline" onClick={clear} style={{ fontSize: "0.8rem", padding: "0.45rem 1rem" }}>
            🗑 Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          padding: "0.25rem 0.5rem",
          marginBottom: "1rem",
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="fade-up"
            style={{
              display: "flex",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                flexShrink: 0,
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                background: msg.role === "user"
                  ? "linear-gradient(135deg, var(--accent-1), var(--accent-2))"
                  : "var(--bg-card)",
                border: "1.5px solid var(--border)",
              }}
            >
              {msg.role === "user" ? "👤" : "🧠"}
            </div>

            {/* Bubble */}
            <div style={{ maxWidth: "78%" }}>
              <div
                style={{
                  background: msg.role === "user" ? "rgba(79,110,247,0.12)" : "var(--bg-card)",
                  border: `1.5px solid ${msg.role === "user" ? "rgba(79,110,247,0.3)" : "var(--border)"}`,
                  borderRadius: msg.role === "user" ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
                  padding: "0.85rem 1.1rem",
                  fontSize: "0.9rem",
                  lineHeight: 1.65,
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {msg.loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)" }}>
                    <span className="spinner" /> Thinking...
                  </span>
                ) : (
                  msg.content
                )}
              </div>

              {/* Sources toggle */}
              {!msg.loading && msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop: "0.4rem" }}>
                  <button
                    onClick={() => setShowSources(showSources === msg.id ? null : msg.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      padding: "0.2rem 0",
                    }}
                  >
                    {showSources === msg.id ? "▲ Hide" : "▼ Show"} {msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}
                  </button>

                  {showSources === msg.id && (
                    <div className="fade-up" style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {msg.sources.map((s, i) => (
                        <div
                          key={i}
                          style={{
                            background: "var(--bg-base)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            padding: "0.6rem 0.8rem",
                            fontSize: "0.78rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              {s.topic && <span className="badge badge-blue" style={{ fontSize: "0.65rem" }}>{s.topic}</span>}
                              {s.source && <span className="badge" style={{ fontSize: "0.65rem", background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>{s.source}</span>}
                            </div>
                            <span style={{ color: "var(--accent-success)", fontWeight: 700, fontSize: "0.7rem" }}>
                              {(s.score * 100).toFixed(0)}% match
                            </span>
                          </div>
                          <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            {s.text.length > 200 ? s.text.slice(0, 200) + "…" : s.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <div
        style={{
          flexShrink: 0,
          background: "var(--bg-card)",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "0.75rem 0.75rem 0.75rem 1rem",
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={inputRef}
          className="textarea"
          rows={1}
          placeholder="Ask a question about your documents… (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
          style={{
            flex: 1,
            minHeight: "42px",
            maxHeight: "140px",
            resize: "none",
            border: "none",
            background: "transparent",
            padding: 0,
            boxShadow: "none",
          }}
        />
        <button
          className="btn btn-primary"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ flexShrink: 0, height: "42px", width: "42px", borderRadius: "10px", padding: 0, fontSize: "1.1rem" }}
        >
          {loading ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : "↑"}
        </button>
      </div>
    </div>
  );
}
