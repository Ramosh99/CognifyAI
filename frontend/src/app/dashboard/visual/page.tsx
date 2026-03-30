"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  visualExplainStream, generateDiagramFromSelection,
  VisualReference, Section, TextSection, ImageSection,
} from "@/lib/api";
import DiagramRenderer from "@/components/DiagramRenderer";

type LearnerType = "Visual" | "Textual" | "Practical";
type Tab = "concept" | "topic" | "style";
type Popover = { text: string; sectionIndex: number; x: number; y: number };
type ToastState = { msg: string; phase: "in" | "out" };

// ── Inline citation renderer ──────────────────────────────────────────────────
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
          }}>{m[1]}</sup>
        );
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function readingTime(sections: Section[]): number {
  const words = sections
    .filter((s): s is TextSection => s.type === "text")
    .reduce((acc, s) => acc + s.body.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 200));
}

// ── Article section renderer ──────────────────────────────────────────────────
function ArticleSection({
  section, index, isLast, isStreaming,
}: {
  section: Section; index: number; isLast: boolean; isStreaming: boolean;
}) {
  const showCursor = isLast && isStreaming && section.type === "text";

  if (section.type === "text") {
    return (
      <div
        data-section-index={index}
        className="section-stream"
        style={{ marginBottom: "2rem", animationDelay: `${index * 0.06}s` }}
      >
        {section.heading && (
          <h2 style={{
            fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)",
            marginBottom: "0.65rem", marginTop: 0, letterSpacing: "-0.02em",
            paddingBottom: "0.45rem", borderBottom: "1px solid var(--border)",
          }}>{section.heading}</h2>
        )}
        <p style={{ fontSize: "1rem", lineHeight: 1.85, color: "var(--text-secondary)", margin: 0 }}
          className={showCursor ? "typewriter-cursor" : ""}
        >
          <CitedText text={section.body} />
        </p>
      </div>
    );
  }

  return (
    <div
      data-section-index={index}
      className="diagram-pop"
      style={{
        margin: "2.5rem 0", borderRadius: "16px", overflow: "hidden",
        border: "1px solid var(--border)", background: "var(--diagram-bg)",
        animationDelay: `${index * 0.06}s`,
      }}
    >
      <div style={{ width: "100%", display: "block" }}>
        <DiagramRenderer data={section.diagram} />
      </div>
      <div style={{
        padding: "0.8rem 1.2rem", borderTop: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: "0.6rem",
      }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--btn-primary-bg)", flexShrink: 0 }} />
        <span style={{ fontSize: "0.81rem", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.4 }}>
          {section.caption}
        </span>
      </div>
    </div>
  );
}

// ── Sources panel ─────────────────────────────────────────────────────────────
function SourcesPanel({ references }: { references: VisualReference[] }) {
  const [active, setActive] = useState<number | null>(null);
  if (!references.length) return null;
  return (
    <div className="section-stream" style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
      <h3 style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 1rem" }}>
        Source Citations
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {references.map((ref) => (
          <div key={ref.num} onClick={() => setActive(active === ref.num ? null : ref.num)}
            style={{
              padding: "0.9rem 1rem", borderRadius: "10px", cursor: "pointer", transition: "all 0.18s ease",
              border: `1px solid ${active === ref.num ? "var(--text-primary)" : "var(--border)"}`,
              background: active === ref.num ? "rgba(128,128,128,0.04)" : "transparent",
            }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <span style={{
                background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)",
                fontSize: "0.6rem", fontWeight: 800, borderRadius: "3px",
                width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>{ref.num}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    {ref.source || "Source Document"}
                  </p>
                  <span style={{ fontSize: "0.68rem", color: "var(--accent-success)", fontWeight: 700 }}>
                    {Math.round(ref.score * 100)}% match
                  </span>
                </div>
                <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
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

// ── Text-selection popover ────────────────────────────────────────────────────
function SelectionPopover({
  popover, onDiagram, onAsk, loading,
}: {
  popover: Popover;
  onDiagram: () => void;
  onAsk: () => void;
  loading: boolean;
}) {
  return (
    <div
      data-selection-popover="true"
      className="popover-animated"
      style={{
        position: "fixed",
        top: popover.y + 10,
        left: popover.x,
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        gap: "0.4rem",
        background: "var(--bg-secondary, #18181b)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "0.35rem",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        pointerEvents: "all",
      }}
    >
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={onDiagram}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          padding: "0.38rem 0.75rem", borderRadius: "7px", border: "none",
          background: loading ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.2)",
          color: "#a5b4fc", fontSize: "0.78rem", fontWeight: 600,
          cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap",
          transition: "background 0.15s",
        }}
      >
        {loading ? <><span className="spinner" style={{ width: "10px", height: "10px" }} /> Generating…</> : "📊 Generate Diagram"}
      </button>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={onAsk}
        style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          padding: "0.38rem 0.75rem", borderRadius: "7px", border: "none",
          background: "rgba(255,255,255,0.05)", color: "var(--text-muted)",
          fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
          transition: "background 0.15s",
        }}
      >
        💬 Ask About This
      </button>
    </div>
  );
}

// ── Loading skeleton (shimmer) ────────────────────────────────────────────────
function LoadingSkeleton({ elapsed }: { elapsed: number }) {
  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <span className="spinner" />
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Writing article from your documents… {elapsed}s
        </span>
      </div>
      <div className="skeleton" style={{ height: "2rem", width: "65%" }} />
      {[100, 85, 92, 70, 88, 60, 95].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: "0.9rem", width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
      ))}
      <div style={{ height: "2rem" }} />
      {[80, 72, 90, 65, 88].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: "0.9rem", width: `${w}%`, animationDelay: `${0.8 + i * 0.1}s` }} />
      ))}
    </div>
  );
}

// ── Inline diagram placeholder ────────────────────────────────────────────────
function DiagramPlaceholder() {
  return (
    <div style={{
      margin: "2rem 0", borderRadius: "14px", border: "1px solid var(--border)",
      padding: "2.5rem", display: "flex", alignItems: "center", gap: "0.8rem",
      color: "var(--text-muted)", fontSize: "0.85rem",
      background: "rgba(99,102,241,0.03)",
    }}>
      <span className="spinner" />
      Generating diagram from selected text…
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VisualPage() {
  const [concept, setConcept]         = useState("");
  const [topic, setTopic]             = useState("");
  const [learnerType, setLearnerType] = useState<LearnerType>("Visual");
  const [loading, setLoading]         = useState(false);
  const [streaming, setStreaming]     = useState(false);   // true while sections still arriving
  const [title, setTitle]             = useState<string | null>(null);
  const [sections, setSections]       = useState<Section[]>([]);
  const [references, setReferences]   = useState<VisualReference[]>([]);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState<Tab>("concept");
  const [elapsed, setElapsed]         = useState(0);
  const [popover, setPopover]         = useState<Popover | null>(null);
  const [popoverLoading, setPopoverLoading] = useState(false);
  const [generatingAt, setGeneratingAt]    = useState<number | null>(null);
  const [toast, setToast]             = useState<ToastState | null>(null);

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  // Elapsed timer while loading
  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  // Text selection listener
  useEffect(() => {
    if (!title) return;
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 20) return;
      const range = sel.getRangeAt(0);
      const el = (range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer) as Element;
      const sectionEl = el?.closest?.("[data-section-index]");
      const sectionIndex = sectionEl ? parseInt(sectionEl.getAttribute("data-section-index")!) : 0;
      const rect = range.getBoundingClientRect();
      setPopover({ text, sectionIndex, x: rect.left + rect.width / 2, y: rect.bottom });
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.("[data-selection-popover]")) {
        setPopover(null);
      }
    };
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [title]);

  const showToast = useCallback((msg: string) => {
    setToast({ msg, phase: "in" });
    // After 2.5s start the fade-out animation, then remove after 0.25s
    setTimeout(() => setToast(t => t ? { ...t, phase: "out" } : null), 2500);
    setTimeout(() => setToast(null), 2750);
  }, []);

  const handleGenerateDiagram = async () => {
    if (!popover) return;
    const { text, sectionIndex } = popover;
    setPopover(null);
    setPopoverLoading(true);
    setGeneratingAt(sectionIndex);
    try {
      const res = await generateDiagramFromSelection({ text });
      const newSection: ImageSection = {
        type: "image",
        caption: `Diagram generated from: "${text.slice(0, 55)}${text.length > 55 ? "…" : ""}"`,
        diagram: res.diagram,
      };
      setSections(prev => {
        const next = [...prev];
        next.splice(sectionIndex + 1, 0, newSection);
        return next;
      });
    } catch {
      showToast("Failed to generate diagram. Try selecting more specific text.");
    } finally {
      setPopoverLoading(false);
      setGeneratingAt(null);
    }
  };

  const handleAskAbout = () => {
    if (!popover) return;
    navigator.clipboard.writeText(popover.text).catch(() => {});
    setPopover(null);
    showToast("✓ Copied! Head to Chat and paste to explore this concept.");
  };

  const generate = async () => {
    if (!concept.trim()) { setError("Please enter a concept."); return; }
    setLoading(true);
    setError("");
    setTitle(null);
    setSections([]);
    setReferences([]);
    setStreaming(false);

    try {
      await visualExplainStream(
        { concept, learner_type: learnerType, topic: topic || undefined },
        {
          onTitle: (t) => {
            setTitle(t);
            setLoading(false);   // hide skeleton — switch to article view
            setStreaming(true);  // sections start arriving
            setTimeout(() => articleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
          },
          onSection: (s) => {
            setSections(prev => [...prev, s]);
          },
          onReferences: (refs) => {
            setReferences(refs);
          },
          onDone: () => {
            setStreaming(false);
          },
          onError: (detail) => {
            setError(detail);
            setLoading(false);
            setStreaming(false);
          },
        },
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setLoading(false);
      setStreaming(false);
    }
  };

  const imgCount = sections.filter(s => s.type === "image").length;
  const minRead  = sections.length ? readingTime(sections) : 0;
  const hasContent = title !== null;

  return (
    <div style={{ maxWidth: "760px" }}>

      {/* Toast */}
      {toast && (
        <div
          className={toast.phase === "in" ? "toast-in" : "toast-out"}
          style={{
            position: "fixed", bottom: "2rem", left: "50%",
            background: "var(--bg-secondary, #18181b)", border: "1px solid var(--border)",
            borderRadius: "10px", padding: "0.6rem 1.2rem", fontSize: "0.82rem",
            color: "var(--text-primary)", zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            pointerEvents: "none", whiteSpace: "nowrap",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Selection popover */}
      {popover && !popoverLoading && (
        <SelectionPopover
          popover={popover}
          onDiagram={handleGenerateDiagram}
          onAsk={handleAskAbout}
          loading={popoverLoading}
        />
      )}

      <div style={{ marginBottom: "3rem" }}>
        <div className="hero-announcement fade-up" style={{ animationDelay: "0.1s", marginBottom: "1.5rem" }}>
          <span className="hero-badge">AI-Powered</span>
          <span>Highlight any text in the article to instantly generate a diagram for it.</span>
        </div>
        <h1 className="fade-up" style={{ animationDelay: "0.2s", marginBottom: "0.75rem", fontSize: "2.4rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
          The visual education engine
        </h1>
        <p className="fade-up" style={{ animationDelay: "0.3s", maxWidth: "580px", fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Turn your documents into a rich, long-form article. Then <strong style={{ color: "var(--text-primary)" }}>highlight any passage</strong> to
          generate a diagram for exactly that concept — on demand, in real time.
        </p>
      </div>

      {/* Terminal Input */}
      <div className="terminal fade-up" style={{ animationDelay: "0.4s", marginBottom: "3rem" }}>
        <div className="terminal-header">
          {(["concept", "topic", "style"] as Tab[]).map(tab => (
            <div key={tab} className={`terminal-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>{tab}</div>
          ))}
        </div>
        <div className="terminal-body" style={{ minHeight: "80px", justifyContent: "center" }}>
          {activeTab === "concept" && (
            <div className="terminal-prompt">
              <span style={{ color: "var(--text-muted)" }}>concept</span>
              <input className="terminal-input"
                placeholder='e.g. "How does photosynthesis work?" or "Explain TCP/IP"'
                value={concept} onChange={e => setConcept(e.target.value)}
                onKeyDown={e => e.key === "Enter" && generate()} autoFocus />
              <button className="btn btn-primary" onClick={generate} disabled={loading || streaming}
                style={{ fontWeight: 700, borderRadius: "4px", padding: "0.4rem 1rem", flexShrink: 0 }}>
                {loading
                  ? <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><span className="spinner" />{elapsed}s</span>
                  : streaming ? "Streaming…" : "Visualize →"}
              </button>
            </div>
          )}
          {activeTab === "topic" && (
            <div className="terminal-prompt">
              <span style={{ color: "var(--text-muted)" }}>topic</span>
              <input className="terminal-input" placeholder="Optional topic filter…"
                value={topic} onChange={e => setTopic(e.target.value)} />
            </div>
          )}
          {activeTab === "style" && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {(["Visual", "Textual", "Practical"] as LearnerType[]).map(l => (
                <button key={l} onClick={() => setLearnerType(l)} style={{
                  padding: "0.4rem 1.2rem", borderRadius: "4px", cursor: "pointer", transition: "all 0.2s ease",
                  border: `1px solid ${learnerType === l ? "var(--text-primary)" : "var(--border)"}`,
                  background: learnerType === l ? "rgba(128,128,128,0.08)" : "transparent",
                  color: learnerType === l ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: "0.8rem", fontWeight: 500,
                }}>{l}</button>
              ))}
            </div>
          )}
        </div>
        {error && <div style={{ padding: "0 1.5rem 1rem", color: "var(--accent-danger)", fontSize: "0.75rem", fontFamily: "ui-monospace" }}>ERROR: {error}</div>}
      </div>

      {/* Loading skeleton */}
      {loading && <LoadingSkeleton elapsed={elapsed} />}

      {/* Article — renders & grows as sections stream in */}
      {hasContent && (
        <div ref={articleRef} className="fade-up">
          <div style={{ marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border)" }}>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 700, letterSpacing: "-0.03em", marginBottom: "0.75rem", color: "var(--text-primary)", lineHeight: 1.25 }}>
              {title}
            </h1>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <span className="badge">{minRead} min read</span>
              <span className="badge" style={{ color: "var(--accent-success)" }}>{sections.filter(s => s.type === "text").length} sections</span>
              {imgCount > 0 && <span className="badge" style={{ color: "#06b6d4" }}>{imgCount} diagram{imgCount !== 1 ? "s" : ""}</span>}
              {references.length > 0 && <span className="badge">{references.length} source{references.length !== 1 ? "s" : ""}</span>}
              {streaming && <span className="badge" style={{ color: "#8b5cf6" }}>⟳ generating…</span>}
              {!streaming && sections.length > 0 && (
                <span className="badge" style={{
                  color: "#a5b4fc", fontSize: "0.7rem", border: "1px dashed rgba(165,180,252,0.4)",
                  background: "rgba(99,102,241,0.08)", animation: "pulse 2s infinite",
                }}>
                  ✦ Highlight text → Generate Diagram
                </span>
              )}
            </div>
          </div>

          {/* Article body */}
          <div>
            {sections.map((section, i) => (
              <div key={i} className={section.type === "image" ? "diagram-expand" : ""}>
                <ArticleSection
                  section={section}
                  index={i}
                  isLast={i === sections.length - 1}
                  isStreaming={streaming}
                />
                {generatingAt === i && <DiagramPlaceholder />}
              </div>
            ))}
          </div>

          {/* References stream in at the end */}
          {references.length > 0 && <SourcesPanel references={references} />}

          {/* Reset — only show when done streaming */}
          {!streaming && sections.length > 0 && (
            <div className="section-stream" style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-outline"
                style={{ borderRadius: "100px", padding: "0.5rem 1.5rem" }}
                onClick={() => {
                  setTitle(null); setSections([]); setReferences([]);
                  setConcept(""); window.scrollTo({ top: 0, behavior: "smooth" });
                }}>
                ← Start New Research
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
