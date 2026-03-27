"use client";
import { useState } from "react";
import { visualExplain, VisualResponse } from "@/lib/api";
import DiagramRenderer from "@/components/DiagramRenderer";

type LearnerType = "Visual" | "Textual" | "Practical";

/** Renders [1][2]... as indigo superscript badges inline */
function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) return (
          <sup key={i} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "17px", height: "17px", borderRadius: "50%", background: "var(--accent-1)", color: "#fff", fontSize: "0.58rem", fontWeight: 700, margin: "0 1px", verticalAlign: "super", lineHeight: 1 }}>
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
    <div style={{ maxWidth: "1060px" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.3rem" }}>
          <h1>Visual Explain</h1>
          <span className="badge badge-blue">AI · Diagram · Cited</span>
        </div>
        <p>Type any concept → a unique diagram + plain-English explanation with numbered source citations.</p>
      </div>

      {/* Input card */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.1rem", marginBottom: "1.75rem" }}>
        {/* Learner chips */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Style:</span>
          {(["Visual", "Textual", "Practical"] as LearnerType[]).map((l) => (
            <button key={l} onClick={() => setLearnerType(l)} style={{ padding: "0.28rem 0.8rem", borderRadius: "999px", border: `1.5px solid ${learnerType === l ? "var(--accent-1)" : "var(--border)"}`, background: learnerType === l ? "rgba(79,110,247,0.12)" : "transparent", color: learnerType === l ? "var(--accent-1)" : "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
              {l === "Visual" ? "👁️" : l === "Textual" ? "📄" : "🛠️"} {l}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: "0.9rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>Concept</label>
            <input className="input" placeholder='e.g. "What is PII redaction?"' value={concept} onChange={(e) => setConcept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && generate()} />
          </div>
          <div>
            <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>Topic filter</label>
            <input className="input" placeholder="optional" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ alignSelf: "flex-end" }}>
            {loading ? <><span className="spinner" /> Generating…</> : "✨ Visualize"}
          </button>
        </div>
        {error && <div className="feedback-box error">{error}</div>}
      </div>

      {/* Loading */}
      {loading && (
        <div className="card fade-up" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1.5rem" }}>
          <span className="spinner" style={{ width: "24px", height: "24px" }} />
          <div>
            <p style={{ color: "var(--text-primary)", fontWeight: 600 }}>Building diagram and explanation…</p>
            <p style={{ fontSize: "0.82rem", marginTop: "0.1rem" }}>Retrieving sources · numbering references · planning diagram</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="fade-up">
          {/* Title + actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <h2>{result.title}</h2>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button className="btn btn-outline" onClick={() => { setResult(null); setConcept(""); }} style={{ fontSize: "0.8rem" }}>← New</button>
              <button className="btn btn-primary" onClick={generate} style={{ fontSize: "0.8rem" }}>🔄 Regenerate</button>
            </div>
          </div>

          {/* Main layout: diagram left, text right */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
            {/* Diagram panel — dark bg matching napkin.ai */}
            <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", lineHeight: 0, background: "#0d1117" }}>
              <DiagramRenderer data={result.diagram} />
            </div>

            {/* Text panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="card">
                <h3 style={{ marginBottom: "0.6rem", fontSize: "0.9rem" }}>📖 Explanation</h3>
                <p style={{ fontSize: "0.875rem", lineHeight: 1.8 }}><CitedText text={result.explanation} /></p>
              </div>
              {result.highlights.length > 0 && (
                <div className="card">
                  <h3 style={{ marginBottom: "0.7rem", fontSize: "0.9rem" }}>⚡ Key Points</h3>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    {result.highlights.map((h, i) => (
                      <li key={i} style={{ display: "flex", gap: "0.5rem", fontSize: "0.85rem", lineHeight: 1.55 }}>
                        <span style={{ flexShrink: 0, width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-1)", marginTop: "6px" }} />
                        <span><CitedText text={h} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Sources */}
          {result.references.length > 0 && (
            <div className="card fade-up">
              <h3 style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>📚 Sources</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {result.references.map((ref) => (
                  <div
                    key={ref.num}
                    onClick={() => setActiveRef(activeRef === ref.num ? null : ref.num)}
                    style={{ display: "flex", gap: "0.75rem", padding: "0.65rem 0.9rem", borderRadius: "var(--radius-sm)", border: `1.5px solid ${activeRef === ref.num ? "var(--accent-1)" : "var(--border)"}`, background: activeRef === ref.num ? "rgba(79,110,247,0.06)" : "var(--bg-base)", cursor: "pointer", transition: "all 0.15s" }}
                  >
                    <div style={{ flexShrink: 0, width: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg,var(--accent-1),var(--accent-2))", color: "#fff", fontSize: "0.65rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{ref.num}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                        {ref.topic  && <span className="badge badge-blue" style={{ fontSize: "0.62rem" }}>{ref.topic}</span>}
                        {ref.source && <span className="badge" style={{ fontSize: "0.62rem", background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>{ref.source}</span>}
                        <span style={{ fontSize: "0.62rem", color: "var(--accent-success)", fontWeight: 700, marginLeft: "auto" }}>{(ref.score * 100).toFixed(0)}% match</span>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5, fontStyle: "italic" }}>"{ref.excerpt}{ref.excerpt.length >= 99 ? "…" : ""}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
