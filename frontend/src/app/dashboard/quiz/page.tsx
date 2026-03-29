"use client";
import { useState } from "react";
import { generateQuiz, analyzeAnswer, QuizQuestion } from "@/lib/api";

type LearnerType = "Visual" | "Textual" | "Practical";
type AnswerMap   = Record<number, string>;
type FeedbackMap = Record<number, string>;

const LEARNER_TYPES: { type: LearnerType; desc: string }[] = [
  { type: "Visual",    desc: "Diagrams, analogies & visual structure" },
  { type: "Textual",   desc: "Clear written explanations & definitions" },
  { type: "Practical", desc: "Examples, use-cases & hands-on context" },
];

export default function QuizPage() {
  const [topic, setTopic]             = useState("");
  const [learnerType, setLearnerType] = useState<LearnerType>("Textual");
  const [qCount, setQCount]           = useState(3);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [questions, setQuestions]     = useState<QuizQuestion[]>([]);
  const [answers, setAnswers]         = useState<AnswerMap>({});
  const [feedbacks, setFeedbacks]     = useState<FeedbackMap>({});
  const [analyzing, setAnalyzing]     = useState<number | null>(null);

  const startQuiz = async () => {
    if (!topic.trim()) { setError("Please enter a topic."); return; }
    setLoading(true); setError(""); setQuestions([]); setAnswers({}); setFeedbacks({});
    try {
      const res = await generateQuiz({ topic, learner_type: learnerType, question_count: qCount });
      const qs  = Array.isArray(res.questions) ? res.questions : [];
      if (!qs.length) throw new Error("No questions returned. Make sure you have ingested documents on this topic first.");
      setQuestions(qs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate quiz.");
    } finally {
      setLoading(false);
    }
  };

  const pickAnswer = async (qi: number, key: string) => {
    if (answers[qi]) return;
    setAnswers((prev) => ({ ...prev, [qi]: key }));
    const q = questions[qi];
    if (key !== q.correct_key) {
      setAnalyzing(qi);
      try {
        const wrongOption  = q.options.find((o) => o.key === key);
        const correctOption = q.options.find((o) => o.key === q.correct_key);
        const res = await analyzeAnswer({
          question:      q.question,
          wrong_answer:  wrongOption?.text  ?? key,
          correct_answer: correctOption?.text ?? q.correct_key,
          topic,
        });
        setFeedbacks((prev) => ({ ...prev, [qi]: res.feedback }));
      } catch {
        setFeedbacks((prev) => ({ ...prev, [qi]: "Could not load misconception analysis." }));
      } finally {
        setAnalyzing(null);
      }
    }
  };

  const score = Object.entries(answers).filter(([qi, key]) => questions[Number(qi)]?.correct_key === key).length;

  return (
    <div style={{ maxWidth: "780px" }}>
      <h1>Quiz</h1>
      <p style={{ marginTop: "0.3rem", marginBottom: "2rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
        Generate concept-aware MCQs. Pick a wrong answer to see why you were wrong.
      </p>

      {/* Config Card */}
      {!questions.length && (
        <div className="card fade-up" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Learner Type */}
          <div>
            <h3 style={{ marginBottom: "0.6rem", fontSize: "0.9rem" }}>Learner type</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem" }}>
              {LEARNER_TYPES.map((l) => (
                <div
                  key={l.type}
                  className={`learner-card ${learnerType === l.type ? "selected" : ""}`}
                  onClick={() => setLearnerType(l.type)}
                >
                  <h3 style={{ fontSize: "0.9rem" }}>{l.type}</h3>
                  <p style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>{l.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Topic + Count */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1rem", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Topic
              </label>
              <input className="input" placeholder="e.g. networking, TCP/IP" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startQuiz()} />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Questions
              </label>
              <select className="input" style={{ width: "80px" }} value={qCount} onChange={(e) => setQCount(Number(e.target.value))}>
                {[2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {error && <div className="feedback-box error">{error}</div>}

          <button className="btn btn-primary" onClick={startQuiz} disabled={loading} style={{ alignSelf: "flex-start" }}>
            {loading ? <><span className="spinner" /> Generating...</> : "Generate Quiz"}
          </button>
        </div>
      )}

      {/* Quiz Questions */}
      {questions.length > 0 && (
        <div className="fade-up">
          {/* Score bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              <span className="badge badge-blue">{learnerType}</span>
              <span className="badge badge-blue">{topic}</span>
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {Object.keys(answers).length}/{questions.length} answered · {score} correct
            </span>
          </div>

          {Object.keys(answers).length === questions.length && (
            <div className={`feedback-box ${score === questions.length ? "success" : "info"} fade-up`} style={{ marginBottom: "1.25rem" }}>
              {score === questions.length
                ? `Perfect score! ${score}/${questions.length}.`
                : `Score: ${score}/${questions.length}. Review the explanations below.`}
            </div>
          )}

          {questions.map((q, qi) => {
            const picked  = answers[qi];
            const isMissed = picked && picked !== q.correct_key;
            return (
              <div key={qi} className="card fade-up" style={{ marginBottom: "1rem", animationDelay: `${qi * 0.05}s` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
                  <h3 style={{ color: "var(--text-primary)", flex: 1, fontSize: "0.9rem" }}>
                    {qi + 1}. {q.question}
                  </h3>
                  {picked && (
                    <span className={`badge ${picked === q.correct_key ? "badge-green" : "badge-red"}`} style={{ marginLeft: "1rem", flexShrink: 0 }}>
                      {picked === q.correct_key ? "Correct" : "Wrong"}
                    </span>
                  )}
                </div>

                <div>
                  {q.options.map((opt, optIdx) => {
                    const letter = opt.key ?? String.fromCharCode(65 + optIdx);
                    let cls = "mcq-option";
                    if (picked) {
                      cls += " disabled";
                      if (letter === q.correct_key) cls += " correct";
                      else if (letter === picked)   cls += " wrong";
                    }
                    return (
                      <button key={`${qi}-${optIdx}`} className={cls} onClick={() => pickAnswer(qi, letter)}>
                        <span style={{ fontWeight: 600, marginRight: "0.5rem", opacity: 0.5 }}>{letter}.</span>
                        {opt.text}
                      </button>
                    );
                  })}
                </div>

                {isMissed && (
                  <div style={{ marginTop: "0.85rem" }}>
                    {analyzing === qi ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                        <span className="spinner" /> Analyzing...
                      </div>
                    ) : feedbacks[qi] ? (
                      <div className="feedback-box error fade-up">
                        <strong style={{ display: "block", marginBottom: "0.4rem", color: "var(--accent-danger)", fontSize: "0.8rem" }}>
                          Misconception Analysis
                        </strong>
                        {feedbacks[qi]}
                      </div>
                    ) : null}
                  </div>
                )}

                {picked === q.correct_key && q.explanation && (
                  <div className="feedback-box success fade-up" style={{ marginTop: "0.6rem" }}>
                    <strong style={{ display: "block", marginBottom: "0.2rem", fontSize: "0.8rem" }}>Why this is correct</strong>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}

          <button className="btn btn-outline" onClick={() => { setQuestions([]); setAnswers({}); setFeedbacks({}); }}>
            ← Try Another Topic
          </button>
        </div>
      )}
    </div>
  );
}
