"use client";
import { useState, useEffect } from "react";
import { getLearnerProfile, getLessonHistory, LearnerProfile, SessionSummary } from "@/lib/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getLearnerProfile(), getLessonHistory()])
      .then(([p, h]) => {
        setProfile(p);
        setHistory(h.sessions);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "0.75rem" }}>
        <div className="spinner" />
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading profile…</span>
      </div>
    );
  }

  if (error) {
    return <div className="feedback-box error" style={{ maxWidth: 600 }}>{error}</div>;
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 560, textAlign: "center", paddingTop: "3rem" }}>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>No learner profile found.</p>
        <a href="/dashboard/onboarding" className="btn btn-primary">Start Diagnostic →</a>
      </div>
    );
  }

  const avgScore = history.length > 0
    ? history.filter((s) => s.quiz_score !== null).reduce((sum, s) => sum + (s.quiz_score ?? 0), 0) /
      history.filter((s) => s.quiz_score !== null).length
    : null;

  return (
    <div style={{ maxWidth: 860, width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <span className="badge badge-blue" style={{ marginBottom: "0.5rem", display: "inline-block" }}>Learner Profile</span>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Your Learning Model</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Updated after every session · {profile.total_sessions} session{profile.total_sessions !== 1 ? "s" : ""} completed
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          {!profile.onboarding_done && (
            <a href="/dashboard/onboarding" className="btn btn-outline" style={{ fontSize: "0.82rem" }}>
              Run Diagnostic →
            </a>
          )}
          <a href="/dashboard/learn" className="btn btn-primary" style={{ fontSize: "0.82rem" }}>
            Start Learning →
          </a>
        </div>
      </div>

      {/* ── Modality preference gauges ── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-secondary)" }}>Modality Preferences</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {[
            { key: "visual_pref", label: "Visual", icon: "📊", color: "#8b5cf6", value: profile.visual_pref ?? 0.5 },
            { key: "text_pref", label: "Text", icon: "📝", color: "#06b6d4", value: profile.text_pref ?? 0.5 },
            { key: "example_pref", label: "Example", icon: "🔬", color: "#10b981", value: profile.example_pref ?? 0.5 },
            { key: "analogy_pref", label: "Analogy", icon: "💡", color: "#f59e0b", value: profile.analogy_pref ?? 0.5 },
            { key: "auditory_pref", label: "Auditory Script", icon: "🎙️", color: "#ec4899", value: profile.auditory_pref ?? 0.5 },
            { key: "code_pref", label: "Implementation Code", icon: "💻", color: "#3b82f6", value: profile.code_pref ?? 0.5 },
          ].map((item) => (
            <div key={item.key} style={{ background: "var(--bg-card)", padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>{item.icon}</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</span>
                </div>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: item.color }}>
                  {Math.round(item.value * 100)}%
                </span>
              </div>
              <GaugeBar value={item.value} color={item.color} />
              <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                {prefLabel(item.value)}
              </p>
            </div>
          ))}
        </div>
      </div>


      {/* ── Skill & difficulty ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "1.25rem" }}>
        {[
          {
            label: "Current Skill",
            value: Math.round(profile.current_skill * 100),
            unit: "%",
            icon: "🎓",
            desc: skillLabel(profile.current_skill),
            color: "var(--accent-success)",
          },
          {
            label: "Difficulty Setting",
            value: Math.round(profile.preferred_diff * 100),
            unit: "%",
            icon: "⚙️",
            desc: diffLabel(profile.preferred_diff),
            color: "var(--accent-warn)",
          },
          {
            label: "Repetition Need",
            value: Math.round(profile.needs_repetition * 100),
            unit: "%",
            icon: "🔁",
            desc: profile.needs_repetition > 0.6 ? "Benefits from revisiting" : "Quick retention",
            color: "var(--badge-blue-text)",
          },
          {
            label: "Learning Pace",
            value: profile.learning_pace,
            unit: "",
            icon: "⚡",
            desc: paceDesc(profile.learning_pace),
            color: "var(--text-primary)",
          },
          ...(avgScore !== null ? [{
            label: "Avg Quiz Score",
            value: Math.round(avgScore * 100),
            unit: "%",
            icon: "📈",
            desc: avgScore >= 0.8 ? "Excellent" : avgScore >= 0.5 ? "On track" : "Needs work",
            color: avgScore >= 0.8 ? "var(--accent-success)" : avgScore >= 0.5 ? "var(--accent-warn)" : "var(--accent-danger)",
          }] : []),
        ].map((item) => (
          <div key={item.label} style={{ background: "var(--bg-card)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span>{item.icon}</span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</span>
            </div>
            <p style={{ fontSize: "1.6rem", fontWeight: 700, color: item.color, letterSpacing: "-0.03em" }}>
              {item.value}{item.unit}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Dominant modality callout ── */}
      <div className="card" style={{ marginBottom: "1.25rem", background: "rgba(139, 92, 246, 0.04)", borderColor: "rgba(139, 92, 246, 0.2)", display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ fontSize: "2rem" }}>🎯</span>
        <div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.2rem" }}>Dominant Modality</p>
          <p style={{ fontWeight: 600, textTransform: "capitalize", color: "var(--text-primary)" }}>
            {profile.dominant_modality}
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
            Your lessons will lead with {profile.dominant_modality} content based on your performance patterns.
            This updates automatically.
          </p>
        </div>
      </div>

      {/* ── Session history ── */}
      {history.length > 0 && (
        <div>
          <h2 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-secondary)" }}>Session History</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 140px", gap: "1rem", padding: "0.5rem 1rem", background: "var(--bg-surface)" }}>
              {["Topic", "Score", "Modality", "Pace (avg ms)", "Date"].map((h) => (
                <span key={h} style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
              ))}
            </div>
            {history.map((s) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 140px", gap: "1rem", padding: "0.75rem 1rem", background: "var(--bg-card)", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.topic}
                </span>
                <span>
                  {s.quiz_score !== null ? (
                    <span className={`badge ${s.quiz_score >= 0.8 ? "badge-green" : s.quiz_score >= 0.5 ? "badge-blue" : "badge-red"}`}>
                      {Math.round(s.quiz_score * 100)}%
                    </span>
                  ) : <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                  {s.dominant_modality ?? "—"}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {s.avg_response_ms ? `${(s.avg_response_ms / 1000).toFixed(1)}s` : "—"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {new Date(s.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>No sessions yet.</p>
          <a href="/dashboard/learn" className="btn btn-outline" style={{ fontSize: "0.85rem" }}>
            Start your first lesson →
          </a>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function GaugeBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.round(value * 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

// ── Label helpers ─────────────────────────────────────────────

function prefLabel(v: number): string {
  if (v >= 0.75) return "Strong preference";
  if (v >= 0.55) return "Moderate preference";
  if (v >= 0.40) return "Neutral";
  return "Low preference";
}

function skillLabel(v: number): string {
  if (v >= 0.75) return "Advanced";
  if (v >= 0.5) return "Intermediate";
  if (v >= 0.3) return "Developing";
  return "Beginner";
}

function diffLabel(v: number): string {
  if (v >= 0.65) return "Challenging questions";
  if (v >= 0.35) return "Balanced difficulty";
  return "Accessible questions";
}

function paceDesc(pace: string): string {
  const map: Record<string, string> = {
    fast: "Quick absorption, fewer repetitions",
    medium: "Steady, balanced pacing",
    slow: "Thorough, more practice",
  };
  return map[pace] ?? "Balanced";
}
