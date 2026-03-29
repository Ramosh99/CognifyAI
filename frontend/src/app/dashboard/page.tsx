export default function DashboardPage() {
  const stats = [
    { label: "Documents", value: "—" },
    { label: "Quizzes", value: "—" },
    { label: "Avg Score", value: "—" },
    { label: "Weak Topics", value: "—" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h1>Welcome back</h1>
        <p style={{ marginTop: "0.3rem", fontSize: "0.9rem" }}>Your adaptive learning hub</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "2.5rem" }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--bg-card)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>{s.value}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 style={{ marginBottom: "1rem" }}>Quick Actions</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {[
          { href: "/dashboard/upload", title: "Upload Material", desc: "Ingest PDFs or paste notes into your knowledge base.", color: "var(--accent-1)" },
          { href: "/dashboard/quiz", title: "Take a Quiz", desc: "Generate concept-aware MCQs on any topic.", color: "var(--accent-2)" },
          { href: "/dashboard/search", title: "Search", desc: "Semantically search your ingested documents.", color: "var(--accent-success)" },
          { href: "/dashboard/analytics", title: "Analytics", desc: "View weak topics and misconception patterns.", color: "var(--accent-warn)" },
        ].map((a) => (
          <a
            key={a.href}
            href={a.href}
            style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "0.5rem", background: "var(--bg-card)", padding: "1.25rem", transition: "background 0.15s ease" }}
          >
            <h3 style={{ color: "var(--text-primary)" }}>{a.title}</h3>
            <p style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>{a.desc}</p>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Open →</span>
          </a>
        ))}
      </div>
    </div>
  );
}
