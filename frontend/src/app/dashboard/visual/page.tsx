"use client";
import { useState } from "react";
import { visualExplain, VisualResponse } from "@/lib/api";
import DiagramRenderer from "@/components/DiagramRenderer";

type LearnerType = "Visual" | "Textual" | "Practical";
type Tab = "concept" | "topic" | "style";

function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) return (
          <sup key={i} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "50%", background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", fontSize: "0.55rem", fontWeight: 700, margin: "0 2px", verticalAlign: "super", lineHeight: 1 }}>
            {m[1]}
          </sup>
        );
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function VisualPage() {
  const [concept, setConcept]         = useState("");
  const [topic, setTopic]             = useState("");
  const [learnerType, setLearnerType] = useState<LearnerType>("Visual");
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<VisualResponse | null>(null);
  const [error, setError]             = useState("");
  const [activeRef, setActiveRef]     = useState<number | null>(null);
  const [activeTab, setActiveTab]     = useState<Tab>("concept");

  const generate = async () => {
    if (!concept.trim()) { setError("Please enter a concept."); return; }
    setLoading(true); setError(""); setResult(null); setActiveRef(null);
    try {
      const res = await visualExplain({ concept, learner_type: learnerType, topic: topic || undefined });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1000px" }}>
      {/* Hero */}
      <div style={{ marginBottom: "3rem" }}>
        <div className="hero-announcement fade-up" style={{ animationDelay: "0.1s", marginBottom: "1.5rem" }}>
          <span className="hero-badge">New</span>
          <span>Educational engine v2 is now available in beta. <a href="#">Learn more</a></span>
        </div>
        <h1 className="fade-up" style={{ animationDelay: "0.2s", marginBottom: "0.75rem", fontSize: "2.4rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
          The visual education engine
        </h1>
        <p className="fade-up" style={{ animationDelay: "0.3s", maxWidth: "600px", fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Generate interactive diagrams, mental models, and deep explanations with verified citations from any concept.
        </p>
      </div>

      {/* Terminal Input */}
      <div className="terminal fade-up" style={{ animationDelay: "0.4s", marginBottom: "3rem" }}>
        <div className="terminal-header">
          {(["concept", "topic", "style"] as Tab[]).map((tab) => (
            <div
              key={tab}
              className={`terminal-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>
        <div className="terminal-body" style={{ minHeight: "80px", justifyContent: "center" }}>
          {activeTab === "concept" && (
            <div className="terminal-prompt">
              <span style={{ color: "var(--text-muted)" }}>concept</span>
              <input
                className="terminal-input"
                placeholder='e.g. "What is PII redaction?"'
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={generate}
                disabled={loading}
                style={{ fontWeight: 700, borderRadius: "4px", padding: "0.4rem 1rem" }}
              >
                {loading ? <span className="spinner" /> : "Visualize"}
              </button>
            </div>
          )}
          {activeTab === "topic" && (
            <div className="terminal-prompt">
              <span style={{ color: "var(--text-muted)" }}>topic</span>
              <input
                className="terminal-input"
                placeholder="Optional topic filter..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          )}
          {activeTab === "style" && (
            <div style={{ display: "flex", gap: "1rem" }}>
              {(["Visual", "Textual", "Practical"] as LearnerType[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLearnerType(l)}
                  style={{
                    padding: "0.4rem 1.2rem",
                    borderRadius: "4px",
                    border: `1px solid ${learnerType === l ? "var(--text-primary)" : "var(--border)"}`,
                    background: learnerType === l ? "rgba(128,128,128,0.08)" : "transparent",
                    color: learnerType === l ? "var(--text-primary)" : "var(--text-muted)",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <div style={{ padding: "0 1.5rem 1rem", color: "var(--accent-danger)", fontSize: "0.75rem", fontFamily: "ui-monospace" }}>ERROR: {error}</div>}
      </div>

      {/* Results */}
      {result && (
        <div className="fade-up" style={{ borderTop: "1px solid var(--border)", paddingTop: "3rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "3rem" }}>
            {/* Left: Diagram & Summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 500, marginBottom: "0.5rem" }}>{result.title}</h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                   <span className="badge">Interactive view</span>
                   <span className="badge" style={{ color: "var(--accent-success)" }}>Verified</span>
                </div>
              </div>

              <div style={{
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--diagram-bg)",
                aspectRatio: "1.6 / 1",
                display: "flex",
                alignItems: "center"
              }}>
                <DiagramRenderer data={result.diagram} />
              </div>

              {/* Highlights */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Key Mechanisms</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {result.highlights.map((h, i) => (
                    <div key={i} style={{ display: "flex", gap: "1rem" }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.9rem" }}>0{i+1}</span>
                      <p style={{ fontSize: "0.95rem", lineHeight: 1.6 }}><CitedText text={h} /></p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Detailed Explanation & Sources */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
              <div>
                <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>Detailed Explanation</h3>
                <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text-primary)" }}>
                  <CitedText text={result.explanation} />
                </p>
              </div>

              {/* Sources */}
              {result.references.length > 0 && (
                <div>
                  <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>Source Citations</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {result.references.map((ref) => (
                      <div
                        key={ref.num}
                        onClick={() => setActiveRef(activeRef === ref.num ? null : ref.num)}
                        style={{
                          padding: "1rem",
                          borderRadius: "var(--radius-sm)",
                          border: `1px solid ${activeRef === ref.num ? "var(--text-primary)" : "var(--border)"}`,
                          background: activeRef === ref.num ? "rgba(128,128,128,0.04)" : "transparent",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <div style={{ display: "flex", gap: "1rem" }}>
                          <span style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", fontSize: "0.65rem", fontWeight: 800, borderRadius: "2px", width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ref.num}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{ref.source || "Scientific Source"}</p>
                              <span style={{ fontSize: "0.7rem", color: "var(--accent-success)", fontWeight: 700 }}>{Math.round(ref.score * 100)}% Match</span>
                            </div>
                            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.5 }}>{'"'}{ref.excerpt.length > 120 ? ref.excerpt.slice(0, 120) + "..." : ref.excerpt}{'"'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn btn-outline"
                style={{ alignSelf: "flex-start", padding: "0.5rem 1.5rem", borderRadius: "100px" }}
                onClick={() => { setResult(null); setConcept(""); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                Start New Research
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
