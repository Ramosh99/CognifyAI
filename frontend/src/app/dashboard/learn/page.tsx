"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  generateLesson,
  completeLesson,
  getLearnerProfile,
  LearnerProfile,
  LessonGenerateResponse,
  AdaptiveLesson,
  LessonSection,
  QuizQuestion,
  MCQOption,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────

export default function LearnPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [topic, setTopic] = useState("");
  const [inputTopic, setInputTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [lessonResp, setLessonResp] = useState<LessonGenerateResponse | null>(null);
  const [activeSection, setActiveSection] = useState(0);

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizRevealed, setQuizRevealed] = useState<Record<number, boolean>>({});
  const [quizTimes, setQuizTimes] = useState<Record<number, number>>({});
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adaptation, setAdaptation] = useState<Record<string, unknown> | null>(null);
  const questionStartRef = useRef<Record<number, number>>({});

  // Load profile on mount
  useEffect(() => {
    getLearnerProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  const handleGenerate = useCallback(async () => {
    const t = inputTopic.trim();
    if (!t) return;
    setTopic(t);
    setGenerating(true);
    setError("");
    setLessonResp(null);
    setActiveSection(0);
    setQuizAnswers({});
    setQuizRevealed({});
    setQuizTimes({});
    setQuizCompleted(false);
    setAdaptation(null);

    try {
      const res = await generateLesson(t);
      setLessonResp(res);
      questionStartRef.current = {};
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate lesson.");
    } finally {
      setGenerating(false);
    }
  }, [inputTopic]);

  const handleQuizAnswer = (qIdx: number, key: string) => {
    if (quizRevealed[qIdx]) return;
    if (!questionStartRef.current[qIdx]) {
      questionStartRef.current[qIdx] = Date.now();
    }
    const ms = Date.now() - (questionStartRef.current[qIdx] ?? Date.now());
    setQuizAnswers((prev) => ({ ...prev, [qIdx]: key }));
    setQuizRevealed((prev) => ({ ...prev, [qIdx]: true }));
    setQuizTimes((prev) => ({ ...prev, [qIdx]: ms }));
  };

  const handleCompleteSession = async () => {
    if (!lessonResp) return;
    const quiz = lessonResp.lesson.quiz;
    const answered = Object.keys(quizAnswers).length;
    const correct = quiz.filter((q, i) => quizAnswers[i] === q.correct_key).length;
    const score = answered > 0 ? correct / answered : 0;
    const avgMs = Object.values(quizTimes).length > 0
      ? Math.round(Object.values(quizTimes).reduce((a, b) => a + b, 0) / Object.values(quizTimes).length)
      : 30000;

    setSubmitting(true);
    try {
      const res = await completeLesson({
        session_id: lessonResp.session_id,
        topic: lessonResp.lesson.topic,
        dominant_modality: lessonResp.profile_snapshot.dominant_modality,
        quiz_score: score,
        avg_response_ms: avgMs,
        total_attempts: answered,
        correct_attempts: correct,
      });
      setAdaptation(res.adaptation);
      setProfile(res.updated_profile);
      setQuizCompleted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save session.");
    } finally {
      setSubmitting(false);
    }
  };

  const lesson = lessonResp?.lesson;

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 920, width: "100%" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
          <h1 style={{ fontSize: "1.8rem" }}>Adaptive Learn</h1>
          {profile && (
            <a href="/dashboard/profile" style={{ fontSize: "0.78rem", color: "var(--text-muted)", textDecoration: "none" }}>
              View profile →
            </a>
          )}
        </div>
        {profile && (
          <ProfileMiniWidget profile={profile} />
        )}
        {!profile && (
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            No profile yet.{" "}
            <a href="/dashboard/onboarding" style={{ color: "var(--accent-success)", textDecoration: "none" }}>
              Run the diagnostic →
            </a>
          </p>
        )}
      </div>

      {/* ── Topic input ── */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem" }}>
        <input
          id="learn-topic-input"
          className="input"
          style={{ flex: 1, fontSize: "0.95rem", padding: "0.7rem 1rem" }}
          placeholder="Enter a topic to learn… e.g. 'Backpropagation', 'Transformers'"
          value={inputTopic}
          onChange={(e) => setInputTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <button
          id="generate-lesson-btn"
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating || !inputTopic.trim()}
          style={{ whiteSpace: "nowrap" }}
        >
          {generating ? <><span className="spinner" /> Generating…</> : "Generate Lesson"}
        </button>
      </div>

      {error && <div className="feedback-box error" style={{ marginBottom: "1.25rem" }}>{error}</div>}

      {/* ── Generating skeleton ── */}
      {generating && <LessonSkeleton />}

      {/* ── Lesson ── */}
      {lesson && !generating && (
        <div className="fade-up">
          {/* Lesson meta bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1.3rem", flex: 1 }}>{lesson.topic}</h2>
            <span className={`badge ${lesson.difficulty_label === "beginner" ? "badge-green" : lesson.difficulty_label === "advanced" ? "badge-red" : "badge-blue"}`}
              style={{ textTransform: "capitalize" }}>
              {lesson.difficulty_label}
            </span>
            <span className="badge">
              {lessonResp?.profile_snapshot.dominant_modality} learner
            </span>
          </div>

          {/* Section tabs */}
          <div style={{ display: "flex", gap: "0px", marginBottom: "1px", background: "var(--border)", borderRadius: "var(--radius-md) var(--radius-md) 0 0", overflow: "hidden" }}>
            {lesson.sections.map((sec, i) => (
              <button
                key={sec.id}
                id={`section-tab-${i}`}
                onClick={() => setActiveSection(i)}
                style={{
                  flex: 1,
                  padding: "0.65rem 0.5rem",
                  background: activeSection === i ? "var(--bg-card)" : "transparent",
                  border: "none",
                  borderBottom: activeSection === i ? "2px solid var(--accent-success)" : "2px solid transparent",
                  cursor: "pointer",
                  color: activeSection === i ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: "0.78rem",
                  fontFamily: "inherit",
                  fontWeight: activeSection === i ? 600 : 400,
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.2rem",
                }}
              >
                <span>{sectionIcon(sec.type)}</span>
                <span style={{ textTransform: "capitalize" }}>{sec.type}</span>
              </button>
            ))}
            <button
              id="section-tab-quiz"
              onClick={() => setActiveSection(lesson.sections.length)}
              style={{
                flex: 1,
                padding: "0.65rem 0.5rem",
                background: activeSection === lesson.sections.length ? "var(--bg-card)" : "transparent",
                border: "none",
                borderBottom: activeSection === lesson.sections.length ? "2px solid var(--accent-warn)" : "2px solid transparent",
                cursor: "pointer",
                color: activeSection === lesson.sections.length ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: "0.78rem",
                fontFamily: "inherit",
                fontWeight: activeSection === lesson.sections.length ? 600 : 400,
                transition: "all 0.15s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.2rem",
              }}
            >
              <span>✅</span>
              <span>Quiz</span>
            </button>
          </div>

          {/* Section content */}
          <div className="card" style={{ borderRadius: "0 0 var(--radius-md) var(--radius-md)", padding: "1.75rem" }}>
            {activeSection < lesson.sections.length ? (
              <SectionRenderer section={lesson.sections[activeSection]} />
            ) : (
              <QuizPanel
                questions={lesson.quiz}
                answers={quizAnswers}
                revealed={quizRevealed}
                completed={quizCompleted}
                submitting={submitting}
                adaptation={adaptation}
                onAnswer={handleQuizAnswer}
                onComplete={handleCompleteSession}
                onNextLesson={() => {
                  setInputTopic("");
                  setLessonResp(null);
                }}
              />
            )}
          </div>

          {/* Navigation footer */}
          {activeSection < lesson.sections.length && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button
                className="btn btn-outline"
                onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
                disabled={activeSection === 0}
              >
                ← Previous
              </button>
              <button
                id="next-section-btn"
                className="btn btn-primary"
                onClick={() => setActiveSection(activeSection + 1)}
              >
                {activeSection === lesson.sections.length - 1 ? "Take Quiz →" : "Next →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section renderer
// ─────────────────────────────────────────────────────────────

function SectionRenderer({ section }: { section: LessonSection }) {
  if (section.type === "diagram" || section.diagram_json) {
    const code = section.diagram_json || section.content || `graph TD;\n  Topic[Visual Overview] --> Detail[Core Structure]`;
    return <DiagramSection rawJson={code} label={section.label} />;
  }

  if (section.type === "auditory") {
    return <AudioScriptPlayer text={section.content ?? "Listen to the spoken explanation below."} label={section.label} />;
  }
  if (section.type === "code") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <span style={{ fontSize: "1.2rem" }}>💻</span>
          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            {section.label}
          </span>
        </div>
        <pre style={{
          background: "#0d1117",
          padding: "1rem",
          borderRadius: "8px",
          color: "#e6edf3",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          overflowX: "auto",
          lineHeight: 1.6,
        }}>
          <code>{section.content}</code>
        </pre>
      </div>
    );
  }

function formatMarkdownHTML(text: string): string {
  if (!text) return "";
  let html = text;
  // Convert markdown images ![alt](url) -> <img ... />
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%; height:auto; border-radius:8px; margin:1rem 0; display:block; border:1px solid var(--border);" />');
  // Convert markdown links [text](url) -> <a ...>text</a>
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#8b5cf6; text-decoration:underline;">$1</a>');
  // Convert bold **text** -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return html;
}

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.2rem" }}>{sectionIcon(section.type)}</span>
        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
          {section.label}
        </span>
      </div>
      <div
        style={{ fontSize: "0.92rem", lineHeight: 1.9, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}
        dangerouslySetInnerHTML={{ __html: formatMarkdownHTML(section.content ?? "") }}
      />
    </div>
  );
}


function DiagramSection({ rawJson, label }: { rawJson: string; label: string }) {
  let cleanCode = (rawJson ?? "").trim().replace(/^```(?:mermaid)?/i, "").replace(/```$/, "").trim();
  const isMermaid = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap)/i.test(cleanCode);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !cleanCode) return;
    if (!isMermaid) {
      cleanCode = `graph TD;\n  A["${cleanCode.replace(/"/g, "'").slice(0, 60)}"]`;
    }
    import("mermaid").then(async (m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        suppressErrorRendering: true,
        securityLevel: "loose",
      });

      // Remove leftover error divs created by mermaid in document body
      if (typeof document !== "undefined") {
        document.querySelectorAll(".mermaid-error, [id^='dmermaid'], [id^='d-']").forEach((el) => el.remove());
      }

      try {
        const isValid = await m.default.parse(cleanCode).catch(() => false);
        if (!isValid) throw new Error("Invalid mermaid syntax");

        const { svg } = await m.default.render("lesson-diag-" + Math.random().toString(36).slice(2), cleanCode);
        if (ref.current) ref.current.innerHTML = svg;
      } catch {
        if (typeof document !== "undefined") {
          document.querySelectorAll(".mermaid-error, [id^='dmermaid'], [id^='d-']").forEach((el) => el.remove());
        }
        if (ref.current) {
          ref.current.innerHTML = `<pre style="font-size:0.8rem;color:var(--text-secondary);overflow-x:auto;white-space:pre-wrap">${cleanCode}</pre>`;
        }
      }
    }).catch(() => {});
  }, [cleanCode, isMermaid]);



  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.2rem" }}>📊</span>
        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
          {label}
        </span>
      </div>
      {isMermaid ? (
        <div ref={ref} style={{ overflowX: "auto", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", padding: "1rem" }} />
      ) : (
        <pre style={{ fontSize: "0.78rem", color: "var(--text-secondary)", overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          {rawJson}
        </pre>
      )}
    </div>
  );
}

function AudioScriptPlayer({ text, label }: { text: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const handlePlay = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in your browser.");
      return;
    }
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      setPlaying(true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => { setPlaying(false); setPaused(false); };
    utterance.onerror = () => { setPlaying(false); setPaused(false); };
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  };

  const handlePause = () => {
    if (typeof window !== "undefined" && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setPaused(true);
      setPlaying(false);
    }
  };

  const handleStop = () => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
      setPlaying(false);
      setPaused(false);
    }
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.2rem" }}>🎙️</span>
        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
          {label ?? "Spoken-Word Audio Script"}
        </span>
      </div>
      <div style={{ padding: "1.25rem", background: "rgba(236, 72, 153, 0.05)", border: "1px solid rgba(236, 72, 153, 0.2)", borderRadius: "var(--radius-md)", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>🔊</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>Voice Narration</span>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {!playing ? (
              <button className="btn btn-primary" onClick={handlePlay} style={{ fontSize: "0.8rem", background: "#ec4899", borderColor: "#ec4899", padding: "0.4rem 0.8rem" }}>
                ▶ Play Voice
              </button>
            ) : (
              <>
                <button className="btn btn-outline" onClick={handlePause} style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}>
                  ⏸ Pause
                </button>
                <button className="btn btn-outline" onClick={handleStop} style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}>
                  ⏹ Stop
                </button>
              </>
            )}
          </div>
        </div>
        <p style={{ fontSize: "0.92rem", lineHeight: 1.8, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
          {text}
        </p>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Quiz panel (with timer tracking)
// ─────────────────────────────────────────────────────────────

function QuizPanel({
  questions, answers, revealed, completed, submitting, adaptation,
  onAnswer, onComplete, onNextLesson,
}: {
  questions: QuizQuestion[];
  answers: Record<number, string>;
  revealed: Record<number, boolean>;
  completed: boolean;
  submitting: boolean;
  adaptation: Record<string, unknown> | null;
  onAnswer: (i: number, key: string) => void;
  onComplete: () => void;
  onNextLesson: () => void;
}) {
  const allAnswered = questions.length > 0 && questions.every((_, i) => revealed[i]);
  const correct = questions.filter((q, i) => answers[i] === q.correct_key).length;
  const score = questions.length > 0 ? (correct / questions.length) * 100 : 0;

  if (completed && adaptation) {
    return (
      <div className="fade-up">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
            {score >= 80 ? "🏆" : score >= 50 ? "📈" : "🔄"}
          </div>
          <h3 style={{ marginBottom: "0.25rem" }}>
            {correct} / {questions.length} correct — {Math.round(score)}%
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {score >= 80 ? "Excellent! Your profile has been updated." : score >= 50 ? "Good work. Profile updated." : "Keep going — the system will adapt."}
          </p>
        </div>

        {/* Adaptation card */}
        <div className="card" style={{ marginBottom: "1.25rem", background: "rgba(52, 211, 153, 0.04)", borderColor: "rgba(52, 211, 153, 0.2)" }}>
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent-success)", marginBottom: "0.75rem" }}>
            ⚡ Profile Updated
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {[
              { label: "Modality reinforced", value: String(adaptation.modality_reinforced) },
              { label: "New difficulty", value: `${Math.round(Number(adaptation.new_difficulty) * 100)}%` },
              { label: "Skill estimate", value: `${Math.round(Number(adaptation.new_skill) * 100)}%` },
              { label: "Learning pace", value: String(adaptation.pace) },
            ].map((item) => (
              <div key={item.label} style={{ padding: "0.5rem 0.75rem", background: "var(--bg-base)", borderRadius: "var(--radius-sm)" }}>
                <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.1rem" }}>{item.label}</p>
                <p style={{ fontSize: "0.88rem", color: "var(--text-primary)", fontWeight: 500, textTransform: "capitalize" }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <button id="next-lesson-btn" className="btn btn-primary" style={{ width: "100%" }} onClick={onNextLesson}>
          Learn Another Topic →
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            Knowledge Check
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
            {questions.length} question{questions.length !== 1 ? "s" : ""} — your answers update your profile
          </p>
        </div>
        {allAnswered && (
          <span className={`badge ${score >= 80 ? "badge-green" : score >= 50 ? "badge-blue" : "badge-red"}`}>
            {Math.round(score)}%
          </span>
        )}
      </div>

      {questions.map((q, i) => (
        <QuizItem key={i} q={q} idx={i} selected={answers[i]} revealed={revealed[i]} onAnswer={onAnswer} />
      ))}

      {allAnswered && !completed && (
        <button
          id="complete-session-btn"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "1rem" }}
          onClick={onComplete}
          disabled={submitting}
        >
          {submitting ? <><span className="spinner" /> Saving…</> : "Complete Session & Update Profile →"}
        </button>
      )}
    </div>
  );
}

function QuizItem({ q, idx, selected, revealed, onAnswer }: {
  q: QuizQuestion; idx: number; selected?: string; revealed?: boolean; onAnswer: (i: number, k: string) => void;
}) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <p style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "0.75rem" }}>
        <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>Q{idx + 1}.</span>
        {q.question}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {q.options.map((opt: MCQOption) => {
          const isSelected = selected === opt.key;
          const isCorrect = opt.key === q.correct_key;
          let cls = "mcq-option";
          if (revealed) {
            if (isSelected && isCorrect) cls += " correct";
            else if (isSelected && !isCorrect) cls += " wrong";
            else if (isCorrect) cls += " correct";
            else cls += " disabled";
          }
          return (
            <button key={opt.key} className={cls}
              id={`quiz-${idx}-opt-${opt.key}`}
              onClick={() => onAnswer(idx, opt.key)}>
              <span style={{ fontWeight: 600, marginRight: "0.5rem", opacity: 0.5 }}>{opt.key}.</span>
              {opt.text}
            </button>
          );
        })}
      </div>
      {revealed && q.explanation && (
        <div className="feedback-box info" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
          {selected === q.correct_key ? "✓ " : "✗ "}{q.explanation}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Profile mini-widget
// ─────────────────────────────────────────────────────────────

function ProfileMiniWidget({ profile }: { profile: LearnerProfile }) {
  const bars = [
    { label: "Visual", value: profile.visual_pref ?? 0.5, color: "#8b5cf6" },
    { label: "Text", value: profile.text_pref ?? 0.5, color: "#06b6d4" },
    { label: "Example", value: profile.example_pref ?? 0.5, color: "#10b981" },
    { label: "Analogy", value: profile.analogy_pref ?? 0.5, color: "#f59e0b" },
    { label: "Auditory", value: profile.auditory_pref ?? 0.5, color: "#ec4899" },
    { label: "Code", value: profile.code_pref ?? 0.5, color: "#3b82f6" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", padding: "0.75rem 1rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: "0.75rem", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "0.75rem", flex: 1, flexWrap: "wrap" }}>
        {bars.map((b) => (
          <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 54 }}>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{b.label}</span>
            <div style={{ width: 54, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${Math.round(b.value * 100)}%`, height: "100%", background: b.color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{Math.round(b.value * 100)}%</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>
          {profile.dominant_modality} dominant
        </span>
        <span className="badge">
          {profile.learning_pace} pace
        </span>
        <span className="badge">
          {profile.total_sessions} session{profile.total_sessions !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────

function LessonSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {[1, 0.8, 0.9, 0.6].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 40 : 20, width: `${w * 100}%`, borderRadius: 6 }} />
      ))}
      <div style={{ height: 160 }} className="skeleton" />
      {[0.7, 0.85, 0.5].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${w * 100}%` }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sectionIcon(type: string): string {
  const icons: Record<string, string> = {
    text: "📝",
    diagram: "📊",
    example: "🔬",
    analogy: "💡",
    auditory: "🎙️",
    code: "💻",
  };
  return icons[type] ?? "📄";
}

