"use client";
import { useState, useEffect } from "react";
import { getLearnerProfile, getLessonHistory, LearnerProfile, SessionSummary } from "@/lib/api";

export default function AnalyticsPage() {
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
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading your capability metrics…</span>
      </div>
    );
  }

  if (error) {
    return <div className="feedback-box error" style={{ maxWidth: 600 }}>{error}</div>;
  }

  // Calculate overall mastery
  const scoredSessions = history.filter((s) => s.quiz_score !== null);
  const avgScore = scoredSessions.length > 0
    ? scoredSessions.reduce((sum, s) => sum + (s.quiz_score ?? 0), 0) / scoredSessions.length
    : (profile?.current_skill ?? 0.5);

  const masteryPct = Math.round(avgScore * 100);

  // Derive Topic Mastery Breakdown from session history
  const topicMap: Record<string, { totalScore: number; count: number; lastDate: string }> = {};
  history.forEach((s) => {
    const key = s.topic.trim();
    if (!topicMap[key]) {
      topicMap[key] = { totalScore: 0, count: 0, lastDate: s.started_at };
    }
    if (s.quiz_score !== null) {
      topicMap[key].totalScore += s.quiz_score;
      topicMap[key].count += 1;
    }
  });

  const topicList = Object.entries(topicMap).map(([topicName, data]) => {
    const avg = data.count > 0 ? data.totalScore / data.count : 0.7;
    return {
      topic: topicName,
      mastery: Math.round(avg * 100),
      count: data.count,
      lastDate: data.lastDate,
      status: avg >= 0.8 ? "Mastered" : avg >= 0.6 ? "Proficient" : "Developing",
    };
  });

  // Calculate Cognitive Capabilities
  const capabilities = profile ? getCapabilities(profile) : [];

  return (
    <div style={{ maxWidth: "880px", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <span className="badge badge-blue" style={{ marginBottom: "0.5rem", display: "inline-block" }}>
          Knowledge Intelligence
        </span>
        <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Knowledge & Capability Analytics</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          A breakdown of what you know, your concept mastery, and your cognitive strengths.
        </p>
      </div>

      {/* Top Banner Stats: Mastery & Skill Level */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "1.5rem" }}>
        
        {/* Concept Mastery Ring */}
        <div style={{ background: "var(--bg-card)", padding: "1.5rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "0.95rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Overall Concept Mastery
          </h2>
          <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 0.85rem" }}>
            <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="url(#grad)" strokeWidth="8"
                strokeDasharray="264"
                strokeDashoffset={264 - (264 * masteryPct) / 100}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.8s ease" }}
              />
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                {masteryPct}%
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Mastery Score
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Calculated across {history.length} session{history.length !== 1 ? "s" : ""} & quizzes.
          </p>
        </div>

        {/* Current Skill & Pace Level */}
        <div style={{ background: "var(--bg-card)", padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "0.95rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Current Competency Profile
          </h2>
          
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Skill Level</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent-success)" }}>
                {Math.round((profile?.current_skill ?? 0.5) * 100)}% ({getSkillBadge(profile?.current_skill ?? 0.5)})
              </span>
            </div>
            <div className="progress-bar-bg" style={{ height: 6 }}>
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round((profile?.current_skill ?? 0.5) * 100)}%`, background: "var(--accent-success)" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Target Difficulty</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f59e0b" }}>
                {Math.round((profile?.preferred_diff ?? 0.5) * 100)}%
              </span>
            </div>
            <div className="progress-bar-bg" style={{ height: 6 }}>
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round((profile?.preferred_diff ?? 0.5) * 100)}%`, background: "#f59e0b" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <span className="badge badge-blue">Pace: {profile?.learning_pace ?? "balanced"}</span>
            <span className="badge">Dominant: {profile?.dominant_modality ?? "visual"}</span>
          </div>
        </div>

      </div>

      {/* "What I'm Capable Of" — Cognitive Capabilities */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.85rem", color: "var(--text-primary)" }}>
          💡 What You Are Capable Of
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
          {capabilities.map((cap, i) => (
            <div key={i} className="card" style={{ padding: "1.1rem", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.4rem" }}>{cap.icon}</span>
                <h3 style={{ fontSize: "0.9rem", color: "var(--text-primary)", margin: 0 }}>{cap.title}</h3>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                {cap.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* "What I Know" — Topic Knowledge Matrix */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "1.5rem" }}>
        <div style={{ padding: "1.25rem 1.25rem 0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.05rem" }}>📚 What You Know (Topic Knowledge Matrix)</h2>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              Topics you have studied and your validated mastery level
            </p>
          </div>
        </div>

        {topicList.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}>
                <th style={{ textAlign: "left", padding: "0.6rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Topic</th>
                <th style={{ textAlign: "left", padding: "0.6rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Mastery</th>
                <th style={{ textAlign: "left", padding: "0.6rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                <th style={{ textAlign: "left", padding: "0.6rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {topicList.map((t) => (
                <tr key={t.topic} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.75rem 1.25rem", color: "var(--text-primary)", fontWeight: 500 }}>{t.topic}</td>
                  <td style={{ padding: "0.75rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div className="progress-bar-bg" style={{ width: 80, height: 6 }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${t.mastery}%`,
                            background: t.mastery >= 80 ? "var(--accent-success)" : t.mastery >= 60 ? "#f59e0b" : "var(--accent-danger)",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{t.mastery}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 1.25rem" }}>
                    <span className={`badge ${t.status === "Mastered" ? "badge-green" : t.status === "Proficient" ? "badge-blue" : "badge-red"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1.25rem", color: "var(--text-muted)" }}>
                    {t.count} session{t.count !== 1 ? "s" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            No topics completed yet. Complete your first lesson to start building your Knowledge Matrix!
          </div>
        )}
      </div>

      {/* Recent Sessions Table */}
      {history.length > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          <div style={{ padding: "1.25rem 1.25rem 0.75rem" }}>
            <h2 style={{ fontSize: "1rem" }}>Recent Learning & Quiz Log</h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Topic</th>
                <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</th>
                <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Modality</th>
                <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.65rem 1.25rem", color: "var(--text-primary)" }}>{s.topic}</td>
                  <td style={{ padding: "0.65rem 1.25rem", color: "var(--text-muted)" }}>
                    {new Date(s.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                  <td style={{ padding: "0.65rem 1.25rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                    {s.dominant_modality ?? "visual"}
                  </td>
                  <td style={{ padding: "0.65rem 1.25rem" }}>
                    {s.quiz_score !== null ? (
                      <span className={`badge ${s.quiz_score >= 0.8 ? "badge-green" : s.quiz_score >= 0.5 ? "badge-blue" : "badge-red"}`}>
                        {Math.round(s.quiz_score * 100)}%
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

function getSkillBadge(val: number): string {
  if (val >= 0.8) return "Advanced";
  if (val >= 0.6) return "Proficient";
  if (val >= 0.4) return "Intermediate";
  return "Developing";
}

function getCapabilities(profile: LearnerProfile) {
  const caps = [];

  // Code capability
  if ((profile.code_pref ?? 0.5) >= 0.55) {
    caps.push({
      icon: "💻",
      title: "Algorithmic Implementation",
      description: `With a ${Math.round((profile.code_pref ?? 0.5) * 100)}% code preference, you excel at understanding concepts directly through code snippets, pseudocode, and technical implementation.`,
    });
  }

  // Visual capability
  if (profile.visual_pref >= 0.55) {
    caps.push({
      icon: "📊",
      title: "Architectural & Diagrammatic Synthesis",
      description: `With a ${Math.round(profile.visual_pref * 100)}% visual preference, you are capable of rapidly parsing complex system architectures, Mermaid graphs, and spatial relationship flowcharts.`,
    });
  }

  // Example capability
  if (profile.example_pref >= 0.55) {
    caps.push({
      icon: "🔬",
      title: "Real-World Application",
      description: `With a ${Math.round(profile.example_pref * 100)}% example preference, you excel at grounding abstract technical theories into concrete production case studies and practical scenarios.`,
    });
  }

  // Analogy capability
  if (profile.analogy_pref >= 0.55) {
    caps.push({
      icon: "💡",
      title: "Intuitive Mental Modeling",
      description: `With a ${Math.round(profile.analogy_pref * 100)}% analogy preference, you build mental models by drawing powerful conceptual parallels between new technical subjects and familiar domains.`,
    });
  }

  // Auditory capability
  if ((profile.auditory_pref ?? 0.5) >= 0.55) {
    caps.push({
      icon: "🎙️",
      title: "Conversational & Listening Retention",
      description: `With a ${Math.round((profile.auditory_pref ?? 0.5) * 100)}% auditory score, you effectively absorb information when presented as spoken narrative scripts and conversational breakdowns.`,
    });
  }

  // Text capability
  if (profile.text_pref >= 0.55) {
    caps.push({
      icon: "📝",
      title: "Textual & Structured Analysis",
      description: `With a ${Math.round(profile.text_pref * 100)}% text preference, you process detailed written explanations, formal definitions, and structured prose with high accuracy.`,
    });
  }

  // Fallback default if all are around baseline
  if (caps.length === 0) {
    caps.push({
      icon: "⚡",
      title: "Versatile Multimodal Learning",
      description: "You possess a balanced learning profile across visual, code, text, analogy, and auditory representations, allowing adaptive lessons to deliver diverse content types.",
    });
  }

  return caps;
}
