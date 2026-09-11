"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import LearnerProfileWidget from "@/components/LearnerProfileWidget";
import { getDocumentStats, getLessonHistory, getLearnerProfile } from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState([
    { label: "Documents", value: "—" },
    { label: "Quizzes", value: "—" },
    { label: "Avg Score", value: "—" },
    { label: "Recent Topic", value: "—" },
  ]);

  useEffect(() => {
    Promise.allSettled([
      getDocumentStats(),
      getLessonHistory(),
      getLearnerProfile(),
    ]).then(([docRes, histRes, profRes]) => {
      let docVal = "0";
      let quizVal = "0";
      let avgVal = "—";
      let topicVal = "—";

      if (docRes.status === "fulfilled") {
        docVal = String(docRes.value.document_count);
      }
      if (histRes.status === "fulfilled") {
        const sessions = histRes.value.sessions || [];
        const validScores = sessions
          .filter((s) => typeof s.quiz_score === "number" && s.quiz_score !== null)
          .map((s) => s.quiz_score as number);
        quizVal = String(sessions.length);
        if (validScores.length > 0) {
          const avg = Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100);
          avgVal = `${avg}%`;
        }
      }
      if (profRes.status === "fulfilled") {
        if (profRes.value.last_topic) {
          topicVal = profRes.value.last_topic;
        }
      }

      setStats([
        { label: "Documents", value: docVal },
        { label: "Quizzes", value: quizVal },
        { label: "Avg Score", value: avgVal },
        { label: "Recent Topic", value: topicVal },
      ]);
    });
  }, []);

  return (
    <div style={{ maxWidth: "860px", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h1>Welcome back</h1>
        <p style={{ marginTop: "0.3rem", fontSize: "0.9rem" }}>Your adaptive truth-aware learning system</p>
      </div>

      {/* Cognitive Learner Model Widget */}
      <div style={{ marginBottom: "2rem" }}>
        <LearnerProfileWidget />
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
          { href: "/dashboard/learn", title: "Adaptive Learn", desc: "Interactive personalized lesson tailored to your style.", color: "var(--accent-1)" },
          { href: "/dashboard/quiz", title: "Take a Quiz", desc: "Concept-aware MCQs with real-time misconception detection.", color: "var(--accent-2)" },
          { href: "/dashboard/upload", title: "Upload Material", desc: "Ingest PDFs or paste notes into your personal knowledge base.", color: "var(--accent-success)" },
          { href: "/dashboard/analytics", title: "Analytics", desc: "Track weak topics, cognitive weights, and progress.", color: "var(--accent-warn)" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "0.5rem", background: "var(--bg-card)", padding: "1.25rem", transition: "background 0.15s ease" }}
          >
            <h3 style={{ color: "var(--text-primary)" }}>{a.title}</h3>
            <p style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>{a.desc}</p>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
