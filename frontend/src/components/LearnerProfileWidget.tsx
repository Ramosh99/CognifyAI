"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getLearnerWeights, LearnerWeightsResponse } from "@/lib/api";

export default function LearnerProfileWidget() {
  const [data, setData] = useState<LearnerWeightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLearnerWeights()
      .then((res) => setData(res))
      .catch((err) => console.log("Failed to load learner weights widget:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          padding: "1.25rem",
          background: "var(--bg-card)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <div className="spinner" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Loading cognitive profile…</span>
      </div>
    );
  }

  if (!data || !data.onboarding_done) {
    return (
      <div
        style={{
          padding: "1.25rem",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.05) 100%)",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🧠</span>
          <div>
            <h4 style={{ fontSize: "0.88rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Cognitive Profile
            </h4>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
              Discover your learning style
            </p>
          </div>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4, margin: 0 }}>
          Take the 1-minute diagnostic to calibrate Gemini Flash to your visual, auditory, and textual preferences.
        </p>
        <Link
          href="/dashboard/onboarding"
          className="btn btn-primary"
          style={{ fontSize: "0.78rem", padding: "0.45rem 0.8rem", alignSelf: "flex-start" }}
        >
          Identify Learner Type →
        </Link>
      </div>
    );
  }

  const weights = data.weights || {};
  const dominant = data.dominant_modality || "text";

  const MODALITY_META: Record<string, { icon: string; color: string; label: string }> = {
    auditory: { icon: "🎧", color: "#ec4899", label: "Auditory" },
    visual: { icon: "👁️", color: "#8b5cf6", label: "Visual" },
    text: { icon: "📄", color: "#06b6d4", label: "Textual" },
    example: { icon: "🔬", color: "#10b981", label: "Applied" },
    analogy: { icon: "💡", color: "#f59e0b", label: "Analogy" },
  };

  const currentMeta = MODALITY_META[dominant] || { icon: "🧠", color: "var(--accent-1)", label: dominant };

  return (
    <div
      style={{
        padding: "1.25rem",
        background: "var(--bg-card)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
      }}
    >
      {/* Header with Dominant Style */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
            <span style={{ fontSize: "1.1rem" }}>{currentMeta.icon}</span>
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: currentMeta.color,
                letterSpacing: "-0.01em",
              }}
            >
              {currentMeta.label} Dominant
            </span>
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: 0, fontFamily: "ui-monospace" }}>
            {data.weight_string}
          </p>
        </div>
        <Link
          href="/dashboard/onboarding"
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Retake
        </Link>
      </div>

      {/* Distribution Bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {["auditory", "visual", "text", "example"].map((m) => {
          const meta = MODALITY_META[m];
          const pct = weights[m] || 0;
          return (
            <div key={m} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", width: "55px" }}>
                {meta.label}
              </span>
              <div
                style={{
                  flex: 1,
                  height: "6px",
                  background: "var(--bg-secondary)",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(4, pct))}%`,
                    height: "100%",
                    background: meta.color,
                    borderRadius: "3px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  width: "28px",
                  textAlign: "right",
                  fontFamily: "ui-monospace",
                }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Adaptive Delivery Focus Pill */}
      {data.guideline && (
        <div
          style={{
            padding: "0.6rem 0.75rem",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-sm)",
            borderLeft: `3px solid ${currentMeta.color}`,
          }}
        >
          <p style={{ fontSize: "0.73rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
            🎯 <strong>Delivery Focus:</strong> {data.guideline.focus_description}
          </p>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
            📉 {data.guideline.less_focus}
          </p>
        </div>
      )}
    </div>
  );
}
