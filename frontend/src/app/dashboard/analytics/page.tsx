export default function AnalyticsPage() {
  // Static placeholder — will be data-driven once user tracking is wired
  const weakTopics = [
    { topic: "Transport vs Application Layer", mistakes: 3, pct: 75 },
    { topic: "UDP vs TCP confusion",           mistakes: 2, pct: 55 },
    { topic: "OSI Model layers",               mistakes: 1, pct: 30 },
  ];

  const recentSessions = [
    { topic: "Networking",      date: "Today",      score: "2/3", trend: "↓" },
    { topic: "Machine Learning",date: "Yesterday",  score: "4/5", trend: "↑" },
    { topic: "TCP/IP",          date: "2 days ago", score: "3/5", trend: "→" },
  ];

  return (
    <div style={{ maxWidth: "900px" }}>
      <h1>Learning Analytics</h1>
      <p style={{ marginTop: "0.4rem", marginBottom: "2rem" }}>
        Track your weak topics and misconception patterns over time.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
        {/* Misconception Hotspots */}
        <div className="card">
          <h2 style={{ marginBottom: "1rem" }}>⚠️ Misconception Hotspots</h2>
          {weakTopics.map((w) => (
            <div key={w.topic} style={{ marginBottom: "1.1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{w.topic}</span>
                <span className="badge badge-red">{w.mistakes} mistakes</span>
              </div>
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${w.pct}%`,
                    background: "linear-gradient(90deg, var(--accent-danger), var(--accent-warn))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Concept Mastery Ring */}
        <div className="card" style={{ textAlign: "center" }}>
          <h2 style={{ marginBottom: "1.5rem" }}>📊 Concept Mastery</h2>
          <div style={{ position: "relative", width: "140px", height: "140px", margin: "0 auto 1rem" }}>
            <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="url(#grad)" strokeWidth="10"
                strokeDasharray="264"
                strokeDashoffset="66"   /* 75% filled */
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--accent-1)" />
                  <stop offset="100%" stopColor="var(--accent-2)" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-primary)" }}>75%</span>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>mastery</span>
            </div>
          </div>
          <p style={{ fontSize: "0.85rem" }}>Based on your quiz performance across all topics.</p>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="card">
        <h2 style={{ marginBottom: "1rem" }}>🕓 Recent Quiz Sessions</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 600 }}>Topic</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 600 }}>Date</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 600 }}>Score</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 600 }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((s) => (
              <tr key={s.topic} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem", color: "var(--text-primary)" }}>{s.topic}</td>
                <td style={{ padding: "0.75rem", color: "var(--text-muted)" }}>{s.date}</td>
                <td style={{ padding: "0.75rem" }}>
                  <span className="badge badge-blue">{s.score}</span>
                </td>
                <td style={{ padding: "0.75rem", fontSize: "1rem" }}>
                  <span style={{ color: s.trend === "↑" ? "var(--accent-success)" : s.trend === "↓" ? "var(--accent-danger)" : "var(--text-muted)" }}>
                    {s.trend}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
