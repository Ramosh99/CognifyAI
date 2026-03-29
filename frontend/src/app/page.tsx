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
          padding: "6rem 2rem 4rem",
          textAlign: "center",
        }}
      >
        <div className="badge badge-blue fade-up" style={{ marginBottom: "1.5rem" }}>
          RAG · pgvector · Misconception Detection
        </div>

        <h1 className="fade-up" style={{ animationDelay: "0.05s", maxWidth: "620px" }}>
          Learn Smarter with{" "}
          <span className="grad-text">Adaptive AI</span>
        </h1>

        <p
          className="fade-up"
          style={{
            marginTop: "1rem",
            maxWidth: "480px",
            fontSize: "1.05rem",
            lineHeight: 1.7,
            animationDelay: "0.1s",
          }}
        >
          Upload your study material. Get concept-aware quizzes.
          Understand exactly why you got something wrong.
        </p>

        <div className="fade-up" style={{ display: "flex", gap: "0.75rem", marginTop: "2.25rem", animationDelay: "0.15s" }}>
          <Link href="/dashboard" className="btn btn-primary" style={{ padding: "0.65rem 1.75rem", fontSize: "0.9rem" }}>
            Dashboard
          </Link>
          <Link href="/dashboard/upload" className="btn btn-outline" style={{ padding: "0.65rem 1.75rem", fontSize: "0.9rem" }}>
            Upload Docs
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section style={{ padding: "3rem 4rem 5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", maxWidth: "1000px", margin: "0 auto", width: "100%" }}>
        {[
          { label: "Adaptive", title: "Learner-Type Adaptation", desc: "Visual, Textual, or Practical — the AI matches how you think.", href: "/dashboard/visual" },
          { label: "Smart", title: "Concept-Aware MCQs", desc: "Every wrong option maps to a specific misconception.", href: "/dashboard/quiz" },
          { label: "Precise", title: "Misconception Detection", desc: "Understand which concept you confused and get targeted corrections.", href: "/dashboard/quiz" },
          { label: "Grounded", title: "Truth-Aware RAG", desc: "Answers grounded in your documents with confidence scoring.", href: "/dashboard/search" },
          { label: "Insight", title: "Learning Analytics", desc: "Track weak topics and repeated mistake patterns over time.", href: "/dashboard/analytics" },
        ].map((f) => (
          <Link 
            key={f.title} 
            href={f.href} 
            className="card fade-up" 
            style={{ 
              textDecoration: "none", 
              transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
              display: "flex", 
              flexDirection: "column", 
              gap: "0.5rem",
              cursor: "pointer",
              padding: "1.5rem"
            }}
          >
            <span className="badge badge-blue" style={{ alignSelf: "flex-start", marginBottom: "0.25rem" }}>{f.label}</span>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</h3>
            <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-secondary)" }}>{f.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
