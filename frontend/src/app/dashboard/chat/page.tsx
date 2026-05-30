"use client";
import { useState, useRef, useEffect } from "react";
import {
  sendChatMessageStream,
  ChatBlock,
  ChatHistoryMessage,
  ChatSource,
} from "@/lib/api";
import DiagramRenderer from "@/components/DiagramRenderer";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  blocks?: ChatBlock[];
  intent?: string;
  loading?: boolean;
};

function historyContent(message: Message): string {
  const parts = [message.content];
  for (const block of message.blocks || []) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "web_results") {
      parts.push(
        block.results
          .map((result, index) => `Web result ${index + 1}: ${result.title} ${result.url} ${result.snippet}`)
          .join("\n")
      );
    } else if (block.type === "quiz") {
      parts.push(block.questions.map((q, index) => `Quiz ${index + 1}: ${q.question}`).join("\n"));
    } else if (block.type === "diagram") {
      parts.push(`Diagram: ${block.diagram.title} ${block.diagram.nodes.map((n) => n.label).join(", ")}`);
    } else if (block.type === "tool_result") {
      parts.push(`${block.title}: ${JSON.stringify(block.data)}`);
    }
  }
  if (message.sources?.length) {
    parts.push(
      message.sources
        .map((source, index) => `Source ${index + 1}: ${source.topic || ""} ${source.source || ""} ${source.text}`)
        .join("\n")
    );
  }
  return parts.filter(Boolean).join("\n\n").slice(0, 3000);
}

function ToolBlock({ block }: { block: ChatBlock }) {
  if (block.type === "quiz") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        {block.questions.map((q, i) => (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.7rem", background: "var(--bg-base)" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.45rem" }}>{i + 1}. {q.question}</div>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              {q.options.map((option) => (
                <div key={option.key} style={{ color: option.key === q.correct_key ? "var(--accent-success)" : "var(--text-secondary)" }}>
                  <strong>{option.key}.</strong> {option.text}
                </div>
              ))}
            </div>
            {q.explanation && <p style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>{q.explanation}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "web_results") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {block.results.map((result, i) => (
          <a key={i} href={result.url} target="_blank" rel="noreferrer" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.65rem", background: "var(--bg-base)", color: "inherit", textDecoration: "none" }}>
            <div style={{ fontWeight: 700 }}>{result.title}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", overflowWrap: "anywhere" }}>{result.url}</div>
            <p style={{ marginTop: "0.35rem", color: "var(--text-secondary)" }}>{result.snippet}</p>
          </a>
        ))}
      </div>
    );
  }

  if (block.type === "diagram") {
    return (
      <div style={{ width: "100%", aspectRatio: "16 / 9", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--diagram-bg)" }}>
        <DiagramRenderer data={block.diagram} />
      </div>
    );
  }

  if (block.type === "tool_result") {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.65rem", background: "var(--bg-base)" }}>
        <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>{block.title}</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-muted)", fontSize: "0.72rem" }}>
          {JSON.stringify(block.data, null, 2)}
        </pre>
      </div>
    );
  }

  return null;
}

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
      .map((m) => ({ role: m.role, content: historyContent(m) }));

    try {
      await sendChatMessageStream(
        { message: text, history, topic: topic || undefined },
        {
          onSources: (sources) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === thinkingMsg.id ? { ...m, sources } : m))
            );
          },
          onIntent: (intent) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === thinkingMsg.id ? { ...m, intent } : m))
            );
          },
          onBlock: (block) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === thinkingMsg.id
                  ? { ...m, blocks: [...(m.blocks || []), block], loading: false }
                  : m
              )
            );
          },
          onStatus: (status) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === thinkingMsg.id && !m.content
                  ? { ...m, content: status, loading: true }
                  : m
              )
            );
          },
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === thinkingMsg.id
                  ? {
                      ...m,
                      content: m.loading ? token : m.content + token,
                      loading: false,
                    }
                  : m
              )
            );
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === thinkingMsg.id ? { ...m, loading: false } : m
              )
            );
          },
          onError: (detail) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === thinkingMsg.id
                  ? { ...m, content: detail, loading: false }
                  : m
              )
            );
          },
        }
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
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 5rem)", maxWidth: "780px", width: "100%", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexShrink: 0 }}>
        <div>
          <h1>Chat</h1>
          <p style={{ marginTop: "0.15rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Study chat with notes, tools, web search, and visual outputs
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
                    <span className="spinner" /> {msg.content || "Thinking..."}
                  </span>
                ) : (
                  msg.content
                )}
              </div>

              {!msg.loading && msg.blocks && msg.blocks.filter((b) => b.type !== "text").length > 0 && (
                <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {msg.blocks.filter((b) => b.type !== "text").map((block, i) => (
                    <ToolBlock key={i} block={block} />
                  ))}
                </div>
              )}

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
