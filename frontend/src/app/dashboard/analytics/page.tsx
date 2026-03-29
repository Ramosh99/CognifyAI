export default function AnalyticsPage() {
  const weakTopics = [
    { topic: "Transport vs Application Layer", mistakes: 3, pct: 75 },
    { topic: "UDP vs TCP confusion",           mistakes: 2, pct: 55 },
    { topic: "OSI Model layers",               mistakes: 1, pct: 30 },
  ];

  const recentSessions = [
    { topic: "Networking",      date: "Today",      score: "2/3", trend: "down" },
    { topic: "Machine Learning",date: "Yesterday",  score: "4/5", trend: "up" },
    { topic: "TCP/IP",          date: "2 days ago", score: "3/5", trend: "flat" },
  ];

  return (
    <div style={{ maxWidth: "860px" }}>
      <h1>Analytics</h1>
      <p style={{ marginTop: "0.3rem", marginBottom: "2rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
        Track weak topics and misconception patterns over time.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "1px" }}>
        {/* Misconception Hotspots */}
        <div style={{ background: "var(--bg-card)", padding: "1.25rem" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Misconception Hotspots</h2>
          {weakTopics.map((w) => (
            <div key={w.topic} style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-primary)" }}>{w.topic}</span>
                <span className="badge badge-red">{w.mistakes}x</span>
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
        <div style={{ background: "var(--bg-card)", padding: "1.25rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2 style={{ marginBottom: "1.25rem", fontSize: "1rem" }}>Concept Mastery</h2>
          <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 0.85rem" }}>
            <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="url(#grad)" strokeWidth="8"
                strokeDasharray="264"
                strokeDashoffset="66"
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
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>75%</span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>mastery</span>
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Based on quiz performance across all topics.</p>
        </div>
      </div>

      {/* Recent Sessions */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginTop: "1px" }}>
        <div style={{ padding: "1.25rem 1.25rem 0.75rem" }}>
          <h2 style={{ fontSize: "1rem" }}>Recent Quiz Sessions</h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Topic</th>
              <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</th>
              <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</th>
              <th style={{ textAlign: "left", padding: "0.5rem 1.25rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((s) => (
              <tr key={s.topic} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.65rem 1.25rem", color: "var(--text-primary)" }}>{s.topic}</td>
                <td style={{ padding: "0.65rem 1.25rem", color: "var(--text-muted)" }}>{s.date}</td>
                <td style={{ padding: "0.65rem 1.25rem" }}>
                  <span className="badge badge-blue">{s.score}</span>
                </td>
                <td style={{ padding: "0.65rem 1.25rem", fontSize: "0.85rem" }}>
                  <span style={{ color: s.trend === "up" ? "var(--accent-success)" : s.trend === "down" ? "var(--accent-danger)" : "var(--text-muted)" }}>
                    {s.trend === "up" ? "↑" : s.trend === "down" ? "↓" : "→"}
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
