"use client";
import { useState, useRef, useEffect } from "react";
import {
  visualExplain,
  VisualResponse,
  Section,
  TextSection,
  ImageSection,
  VisualReference,
} from "@/lib/api";
import DiagramRenderer from "@/components/DiagramRenderer";

type LearnerType = "Visual" | "Textual" | "Practical";
type Tab = "concept" | "topic" | "style";

// ── Inline citation renderer ───────────────────────────────────────────────────
function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) return (
          <sup key={i} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "16px", height: "16px", borderRadius: "50%",
            background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)",
            fontSize: "0.55rem", fontWeight: 700, margin: "0 2px",
            verticalAlign: "super", lineHeight: 1, flexShrink: 0,
          }}>
            {m[1]}
          </sup>
        );
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Reading-time estimate ──────────────────────────────────────────────────────
function readingTime(sections: Section[]): number {
  const words = sections
    .filter((s): s is TextSection => s.type === "text")
    .reduce((acc, s) => acc + s.body.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 200));
}

// ── Article renderer ───────────────────────────────────────────────────────────
function ArticleSection({ section }: { section: Section }) {
  if (section.type === "text") {
    return (
      <div style={{ marginBottom: "2rem" }}>
        {section.heading && (
          <h2 style={{
            fontSize: "1.25rem", fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "0.75rem", marginTop: "0",
            letterSpacing: "-0.02em",
            paddingBottom: "0.5rem",
            borderBottom: "1px solid var(--border)",
          }}>
            {section.heading}
          </h2>
        )}
        <p style={{
          fontSize: "1rem", lineHeight: 1.85,
          color: "var(--text-secondary)",
          margin: 0,
        }}>
          <CitedText text={section.body} />
        </p>
      </div>
    );
  }

  // Image block
  return (
    <div style={{
      margin: "2.5rem 0",
      borderRadius: "16px",
      overflow: "hidden",
      border: "1px solid var(--border)",
      background: "var(--diagram-bg)",
    }}>
      {/* Diagram */}
      <div style={{ width: "100%", display: "block" }}>
        <DiagramRenderer data={section.diagram} />
      </div>
      {/* Caption bar */}
      <div style={{
        padding: "0.85rem 1.25rem",
        borderTop: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
        display: "flex", alignItems: "center", gap: "0.6rem",
      }}>
        <span style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: "var(--btn-primary-bg)", flexShrink: 0,
        }} />
        <span style={{
          fontSize: "0.82rem", color: "var(--text-muted)",
          fontStyle: "italic", lineHeight: 1.4,
        }}>
          {section.caption}
        </span>
      </div>
    </div>
  );
}

// ── Sources panel ──────────────────────────────────────────────────────────────
function SourcesPanel({ references }: { references: VisualReference[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (!references.length) return null;

  return (
    <div style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
      <h3 style={{
        fontSize: "0.75rem", color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: "1rem", margin: "0 0 1rem",
      }}>
        Source Citations
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {references.map((ref) => (
          <div
            key={ref.num}
            onClick={() => setActive(active === ref.num ? null : ref.num)}
            style={{
              padding: "0.9rem 1rem",
              borderRadius: "10px",
              border: `1px solid ${active === ref.num ? "var(--text-primary)" : "var(--border)"}`,
              background: active === ref.num ? "rgba(128,128,128,0.04)" : "transparent",
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span style={{
                background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)",
                fontSize: "0.6rem", fontWeight: 800, borderRadius: "3px",
                width: "18px", height: "18px", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px",
              }}>
                {ref.num}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    {ref.source || "Source Document"}
                  </p>
                  <span style={{ fontSize: "0.68rem", color: "var(--accent-success)", fontWeight: 700 }}>
                    {Math.round(ref.score * 100)}% match
                  </span>
                </div>
                <p style={{
                  fontSize: "0.76rem", color: "var(--text-muted)",
                  fontStyle: "italic", lineHeight: 1.5, margin: 0,
                }}>
                  "{ref.excerpt.length > 130 ? ref.excerpt.slice(0, 130) + "…" : ref.excerpt}"
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function VisualPage() {
  const [concept, setConcept]         = useState("");
  const [topic, setTopic]             = useState("");
  const [learnerType, setLearnerType] = useState<LearnerType>("Visual");
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<VisualResponse | null>(null);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState<Tab>("concept");
  const [elapsed, setElapsed]         = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  // Timer during loading
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const generate = async () => {
    if (!concept.trim()) { setError("Please enter a concept."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await visualExplain({ concept, learner_type: learnerType, topic: topic || undefined });
      setResult(res);
      setTimeout(() => articleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const imageCount = result?.sections.filter(s => s.type === "image").length ?? 0;
  const minRead = result ? readingTime(result.sections) : 0;

  return (
    <div style={{ maxWidth: "760px" }}>

      {/* Hero */}
      <div style={{ marginBottom: "3rem" }}>
        <div className="hero-announcement fade-up" style={{ animationDelay: "0.1s", marginBottom: "1.5rem" }}>
          <span className="hero-badge">New</span>
          <span>Educational engine v2 — illustrated articles with inline diagrams. <a href="#">Learn more</a></span>
        </div>
        <h1 className="fade-up" style={{
          animationDelay: "0.2s", marginBottom: "0.75rem",
          fontSize: "2.4rem", fontWeight: 600, letterSpacing: "-0.03em",
        }}>
          The visual education engine
        </h1>
        <p className="fade-up" style={{
          animationDelay: "0.3s", maxWidth: "580px",
          fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.6,
        }}>
          Enter any concept and get a fully illustrated article — rich explanations,
          inline diagrams, and cited sources — like opening a beautifully written Wikipedia page.
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
                placeholder='e.g. "How does photosynthesis work?" or "Explain TCP/IP"'
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={generate}
                disabled={loading}
                style={{ fontWeight: 700, borderRadius: "4px", padding: "0.4rem 1rem", flexShrink: 0 }}
              >
                {loading
                  ? <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span className="spinner" /> {elapsed}s
                    </span>
                  : "Visualize →"}
              </button>
            </div>
          )}
          {activeTab === "topic" && (
            <div className="terminal-prompt">
              <span style={{ color: "var(--text-muted)" }}>topic</span>
              <input
                className="terminal-input"
                placeholder="Optional topic filter (e.g. biology, networking)…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          )}
          {activeTab === "style" && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {(["Visual", "Textual", "Practical"] as LearnerType[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLearnerType(l)}
                  style={{
                    padding: "0.4rem 1.2rem", borderRadius: "4px",
                    border: `1px solid ${learnerType === l ? "var(--text-primary)" : "var(--border)"}`,
                    background: learnerType === l ? "rgba(128,128,128,0.08)" : "transparent",
                    color: learnerType === l ? "var(--text-primary)" : "var(--text-muted)",
                    fontSize: "0.8rem", fontWeight: 500,
                    cursor: "pointer", transition: "all 0.2s ease",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && (
          <div style={{ padding: "0 1.5rem 1rem", color: "var(--accent-danger)", fontSize: "0.75rem", fontFamily: "ui-monospace" }}>
            ERROR: {error}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{
            height: "2rem", width: "60%", borderRadius: "8px",
            background: "rgba(128,128,128,0.08)", animation: "pulse 1.5s infinite",
          }} />
          {[100, 85, 92, 70].map((w, i) => (
            <div key={i} style={{
              height: "1rem", width: `${w}%`, borderRadius: "6px",
              background: "rgba(128,128,128,0.06)", animation: `pulse 1.5s infinite ${i * 0.15}s`,
            }} />
          ))}
          <div style={{
            height: "260px", width: "100%", borderRadius: "16px",
            background: "rgba(128,128,128,0.05)", animation: "pulse 1.5s infinite 0.6s",
          }} />
          {[88, 75, 95, 60].map((w, i) => (
            <div key={i} style={{
              height: "1rem", width: `${w}%`, borderRadius: "6px",
              background: "rgba(128,128,128,0.06)", animation: `pulse 1.5s infinite ${0.8 + i * 0.15}s`,
            }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
        </div>
      )}

      {/* Article */}
      {result && !loading && (
        <div ref={articleRef} className="fade-up">
          {/* Article header */}
          <div style={{ marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border)" }}>
            <h1 style={{
              fontSize: "1.9rem", fontWeight: 700,
              letterSpacing: "-0.03em", marginBottom: "0.75rem",
              color: "var(--text-primary)", lineHeight: 1.25,
            }}>
              {result.title}
            </h1>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <span className="badge">
                {minRead} min read
              </span>
              <span className="badge" style={{ color: "var(--accent-success)" }}>
                {result.sections.filter(s => s.type === "text").length} sections
              </span>
              {imageCount > 0 && (
                <span className="badge" style={{ color: "#06b6d4" }}>
                  {imageCount} diagram{imageCount !== 1 ? "s" : ""}
                </span>
              )}
              {result.references.length > 0 && (
                <span className="badge">
                  {result.references.length} source{result.references.length !== 1 ? "s" : ""} cited
                </span>
              )}
            </div>
          </div>

          {/* Article body — sections rendered top-to-bottom */}
          <div>
            {result.sections.map((section, i) => (
              <ArticleSection key={i} section={section} />
            ))}
          </div>

          {/* Sources */}
          <SourcesPanel references={result.references} />

          {/* Reset button */}
          <div style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
            <button
              className="btn btn-outline"
              style={{ borderRadius: "100px", padding: "0.5rem 1.5rem" }}
              onClick={() => {
                setResult(null);
                setConcept("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              ← Start New Research
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
