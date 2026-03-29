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
      content: "Hi! I'm CognifyAI. Ask me anything about the documents you've uploaded, and I'll answer based on your knowledge base.",
    },
  ]);
  const [input, setInput]         = useState("");
  const [topic, setTopic]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showSources, setShowSources] = useState<number | null>(null);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);

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
            ? { ...m, content: `${e instanceof Error ? e.message : "Something went wrong"}`, loading: false }
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
      content: "Chat cleared. Ask me anything about your documents.",
    }]);
    setShowSources(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 5rem)", maxWidth: "780px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexShrink: 0 }}>
        <div>
          <h1>Chat</h1>
          <p style={{ marginTop: "0.15rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Answers grounded in your uploaded knowledge base
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <input
            className="input"
            style={{ width: "140px", fontSize: "0.78rem" }}
            placeholder="Filter topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button className="btn btn-outline" onClick={clear} style={{ fontSize: "0.78rem", padding: "0.4rem 0.85rem" }}>
            Clear
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
          gap: "0.75rem",
          padding: "0.25rem 0.25rem",
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
              gap: "0.6rem",
              alignItems: "flex-start",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                flexShrink: 0,
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.65rem",
                fontWeight: 600,
                background: msg.role === "user" ? "var(--accent-1)" : "var(--bg-card)",
                color: msg.role === "user" ? "var(--btn-primary-text)" : "var(--text-muted)",
                border: `1px solid ${msg.role === "user" ? "var(--accent-1)" : "var(--border)"}`,
              }}
            >
              {msg.role === "user" ? "U" : "AI"}
            </div>

            {/* Bubble */}
            <div style={{ maxWidth: "78%" }}>
              <div
                style={{
                  background: msg.role === "user" ? "rgba(91,122,255,0.08)" : "var(--bg-card)",
                  border: `1px solid ${msg.role === "user" ? "rgba(91,122,255,0.2)" : "var(--border)"}`,
                  borderRadius: msg.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                  padding: "0.75rem 1rem",
                  fontSize: "0.85rem",
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
                <div style={{ marginTop: "0.3rem" }}>
                  <button
                    onClick={() => setShowSources(showSources === msg.id ? null : msg.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      padding: "0.15rem 0",
                    }}
                  >
                    {showSources === msg.id ? "Hide" : "Show"} {msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}
                  </button>

                  {showSources === msg.id && (
                    <div className="fade-up" style={{ marginTop: "0.3rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      {msg.sources.map((s, i) => (
                        <div
                          key={i}
                          style={{
                            background: "var(--bg-base)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0.5rem 0.7rem",
                            fontSize: "0.75rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                            <div style={{ display: "flex", gap: "0.3rem" }}>
                              {s.topic && <span className="badge badge-blue" style={{ fontSize: "0.62rem" }}>{s.topic}</span>}
                              {s.source && <span className="badge" style={{ fontSize: "0.62rem", background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>{s.source}</span>}
                            </div>
                            <span style={{ color: "var(--accent-success)", fontWeight: 600, fontSize: "0.68rem" }}>
                              {(s.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            {s.text.length > 180 ? s.text.slice(0, 180) + "..." : s.text}
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
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "0.65rem 0.65rem 0.65rem 0.9rem",
          display: "flex",
          gap: "0.65rem",
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={inputRef}
          className="textarea"
          rows={1}
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
          style={{
            flex: 1,
            minHeight: "38px",
            maxHeight: "120px",
            resize: "none",
            border: "none",
            background: "transparent",
            padding: 0,
            boxShadow: "none",
            fontSize: "0.85rem",
          }}
        />
        <button
          className="btn btn-primary"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ flexShrink: 0, height: "38px", width: "38px", borderRadius: "var(--radius-sm)", padding: 0, fontSize: "0.9rem" }}
        >
          {loading ? <span className="spinner" style={{ width: "14px", height: "14px" }} /> : "↑"}
        </button>
      </div>
    </div>
  );
}
