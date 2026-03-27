export default function DashboardPage() {
  const stats = [
    { label: "Documents Ingested", value: "—", icon: "📄" },
    { label: "Quizzes Taken",      value: "—", icon: "🧠" },
    { label: "Avg Score",          value: "—", icon: "📊" },
    { label: "Weak Topics",        value: "—", icon: "⚠️" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1>Welcome back 👋</h1>
        <p style={{ marginTop: "0.4rem" }}>Your adaptive learning hub — powered by RAG + pgvector.</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span style={{ fontSize: "1.5rem" }}>{s.icon}</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{s.value}</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 style={{ marginBottom: "1rem" }}>Quick Actions</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        {[
          {
            href: "/dashboard/upload",
            icon: "📄",
            title: "Upload Study Material",
            desc: "Ingest PDFs or paste notes into the knowledge base.",
            color: "var(--accent-1)",
          },
          {
            href: "/dashboard/quiz",
            icon: "🧠",
            title: "Take a Quiz",
            desc: "Generate concept-aware MCQs on any topic in your docs.",
            color: "var(--accent-2)",
          },
          {
            href: "/dashboard/search",
            icon: "🔍",
            title: "Search Knowledge Base",
            desc: "Semantically search your ingested documents.",
            color: "var(--accent-success)",
          },
          {
            href: "/dashboard/analytics",
            icon: "📊",
            title: "View Analytics",
            desc: "See your weak topics and misconception patterns.",
            color: "var(--accent-warn)",
          },
        ].map((a) => (
          <a
            key={a.href}
            href={a.href}
            className="card"
            style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "0.6rem" }}
          >
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: `${a.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem" }}>
              {a.icon}
            </div>
            <h3 style={{ color: "var(--text-primary)" }}>{a.title}</h3>
            <p style={{ fontSize: "0.85rem" }}>{a.desc}</p>
            <span style={{ fontSize: "0.8rem", color: a.color, fontWeight: 600 }}>Get started →</span>
          </a>
        ))}
      </div>
    </div>
  );
}
