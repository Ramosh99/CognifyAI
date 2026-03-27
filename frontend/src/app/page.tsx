import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Hero */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "5rem 2rem",
          textAlign: "center",
          background: "radial-gradient(ellipse at 50% 0%, rgba(79,110,247,0.12) 0%, transparent 65%)",
        }}
      >
        <div className="badge badge-blue fade-up" style={{ marginBottom: "1.5rem" }}>
          🧠 RAG · pgvector · Misconception Detection
        </div>

        <h1 className="fade-up" style={{ animationDelay: "0.05s", maxWidth: "680px" }}>
          Learn Smarter with{" "}
          <span className="grad-text">Adaptive AI</span>
        </h1>

        <p
          className="fade-up"
          style={{
            marginTop: "1rem",
            maxWidth: "520px",
            fontSize: "1.1rem",
            lineHeight: 1.7,
            animationDelay: "0.1s",
          }}
        >
          Upload your study material. Get concept-aware quizzes. Understand{" "}
          <em>exactly</em> why you got something wrong — not just that you did.
        </p>

        <div className="fade-up" style={{ display: "flex", gap: "1rem", marginTop: "2rem", animationDelay: "0.15s" }}>
          <Link href="/dashboard" className="btn btn-primary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Go to Dashboard →
          </Link>
          <Link href="/dashboard/upload" className="btn btn-outline" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Upload Docs
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section style={{ padding: "3rem 4rem 5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem", maxWidth: "1100px", margin: "0 auto", width: "100%" }}>
        {[
          { icon: "👁️", title: "Learner-Type Adaptation", desc: "Visual, Textual, or Practical — the AI changes its explanation style to match how you think." },
          { icon: "❓", title: "Concept-Aware MCQs", desc: "Every wrong option maps to a specific misconception, not just a random distractor." },
          { icon: "❌", title: "Misconception Detection", desc: "Understand exactly which concept you confused and get a targeted correction." },
          { icon: "🔍", title: "Truth-Aware RAG", desc: "Answers are grounded in your own uploaded documents with confidence scoring." },
          { icon: "📊", title: "Learning Analytics", desc: "Track your weak topics and repeated mistake patterns over time." },
        ].map((f) => (
          <div key={f.title} className="card fade-up">
            <div style={{ fontSize: "1.75rem", marginBottom: "0.6rem" }}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p style={{ marginTop: "0.4rem", fontSize: "0.875rem", lineHeight: 1.6 }}>{f.desc}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
