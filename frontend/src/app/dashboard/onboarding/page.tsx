"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  startOnboarding,
  submitOnboarding,
  DiagnosticTask,
  DiagnosticSignal,
  QuizQuestion,
} from "@/lib/api";

type Modality = "text" | "diagram" | "example" | "analogy" | "auditory" | "code";
const MODALITIES: Modality[] = ["text", "diagram", "example", "analogy", "auditory", "code"];

const MODALITY_LABELS: Record<Modality, string> = {
  text: "Written Explanation",
  diagram: "Visual Diagram",
  example: "Real-World Example",
  analogy: "Analogy",
  auditory: "Spoken Script",
  code: "Implementation Code",
};

const MODALITY_ICONS: Record<Modality, string> = {
  text: "📝",
  diagram: "📊",
  example: "🔬",
  analogy: "💡",
  auditory: "🎙️",
  code: "💻",
};

type ConceptSignals = Record<Modality, { correct: boolean; ms: number }[]>;

export default function OnboardingPage() {
  const router = useRouter();

  // Step 0=intro (topic entry), 1=loading tasks, 2=diagnostic, 3=submitting, 4=done
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("Machine Learning");

  const [tasks, setTasks] = useState<DiagnosticTask[]>([]);
  const [sessionId, setSessionId] = useState("");

  // Current task & modality
  const [taskIdx, setTaskIdx] = useState(0);
  const [modalityIdx, setModalityIdx] = useState(0);

  // Answer signals: taskIdx → signals per modality
  const signals = useRef<ConceptSignals[]>([]);
  const taskStartRef = useRef<number>(Date.now());

  // Selected answer for current micro-quiz
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const currentTask = tasks[taskIdx];
  const currentModality: Modality = MODALITIES[modalityIdx];
  const currentRep = currentTask?.representations?.[currentModality];

  const totalSteps = tasks.length * MODALITIES.length;
  const doneSteps = taskIdx * MODALITIES.length + modalityIdx;
  const progress = totalSteps > 0 ? (doneSteps / totalSteps) * 100 : 0;

  // ── Load diagnostic tasks ─────────────────────────────────
  const loadTasks = useCallback(async (chosenTopic: string) => {
    setStep(1);
    setLoading(true);
    setError("");
    try {
      const res = await startOnboarding(chosenTopic);
      setTasks(res.tasks);
      setSessionId(res.diagnostic_session_id);
      signals.current = res.tasks.map(() => ({
        text: [], diagram: [], example: [], analogy: [], auditory: [], code: [],
      }));
      taskStartRef.current = Date.now();
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load diagnostic.");
      setStep(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Answer a micro-quiz question ──────────────────────────
  const handleAnswer = (key: string) => {
    if (answered) return;
    const now = Date.now();
    const ms = now - taskStartRef.current;
    const quiz = currentRep?.quiz as QuizQuestion | undefined;
    const correct = quiz?.correct_key === key;

    setSelectedKey(key);
    setAnswered(true);

    if (signals.current[taskIdx]) {
      signals.current[taskIdx][currentModality].push({ correct, ms });
    }
  };

  // ── Advance to next modality / task ──────────────────────
  const handleNext = () => {
    setSelectedKey(null);
    setAnswered(false);
    taskStartRef.current = Date.now();

    if (modalityIdx < MODALITIES.length - 1) {
      setModalityIdx(modalityIdx + 1);
    } else if (taskIdx < tasks.length - 1) {
      setTaskIdx(taskIdx + 1);
      setModalityIdx(0);
    } else {
      handleSubmit();
    }
  };

  // ── Submit signals and build profile ─────────────────────
  const handleSubmit = async () => {
    setStep(3);
    setLoading(true);

    const aggregated: Record<Modality, { score: number; avg_ms: number }> = {
      text: { score: 0, avg_ms: 0 },
      diagram: { score: 0, avg_ms: 0 },
      example: { score: 0, avg_ms: 0 },
      analogy: { score: 0, avg_ms: 0 },
      auditory: { score: 0, avg_ms: 0 },
      code: { score: 0, avg_ms: 0 },
    };

    MODALITIES.forEach((mod) => {
      const all: { correct: boolean; ms: number }[] = [];
      signals.current.forEach((taskSignals) => {
        if (taskSignals[mod]) {
          all.push(...taskSignals[mod]);
        }
      });
      if (all.length === 0) return;
      const score = all.filter((s) => s.correct).length / all.length;
      const avg_ms = Math.round(all.reduce((s, x) => s + x.ms, 0) / all.length);
      aggregated[mod] = { score, avg_ms };
    });

    try {
      await submitOnboarding({
        diagnostic_session_id: sessionId,
        signals: aggregated as Record<string, DiagnosticSignal>,
      });
      setStep(4);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed.");
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  if (step === 0) {
    return (
      <IntroScreen
        topic={topic}
        setTopic={setTopic}
        onStart={() => loadTasks(topic)}
        loading={loading}
        error={error}
      />
    );
  }
  if (step === 1) return <LoadingScreen topic={topic} />;
  if (step === 3) return <SubmittingScreen />;
  if (step === 4) return <DoneScreen onContinue={() => router.push("/dashboard/learn")} />;

  if (step === 2 && !currentTask) return <LoadingScreen topic={topic} />;

  const quiz = currentRep?.quiz as QuizQuestion | undefined;

  return (
    <div style={{ maxWidth: 760, width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div>
            <span className="badge badge-blue" style={{ marginRight: "0.5rem" }}>
              Concept {taskIdx + 1} of {tasks.length}
            </span>
            <span className="badge" style={{ textTransform: "capitalize" }}>
              {MODALITY_ICONS[currentModality]} {MODALITY_LABELS[currentModality]}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {Math.round(progress)}% complete
          </span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Concept label */}
      <h2 style={{ marginBottom: "0.25rem", textTransform: "capitalize", fontSize: "1.4rem" }}>
        {currentTask.concept}
      </h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
        Concept {taskIdx + 1} derived from <strong style={{ color: "var(--text-secondary)" }}>{topic}</strong>. We're showing this in a <strong style={{ color: "var(--text-secondary)" }}>{MODALITY_LABELS[currentModality].toLowerCase()}</strong> format.
      </p>

      {/* Content card */}
      <div className="card fade-up" style={{ marginBottom: "1.25rem", padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <span style={{ fontSize: "1.2rem" }}>{MODALITY_ICONS[currentModality]}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {MODALITY_LABELS[currentModality]}
          </span>
        </div>

        {currentModality === "diagram" && currentRep?.mermaid ? (
          <MermaidBlock code={currentRep.mermaid} />
        ) : currentModality === "auditory" ? (
          <AudioScriptPlayer text={currentRep?.content || `So when we talk about ${currentTask?.concept}, imagine explaining it aloud to a listener naturally.`} />
        ) : currentModality === "code" ? (
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
            <code>{currentRep?.content || `# Implementation of ${currentTask?.concept}\ndef process():\n    pass`}</code>
          </pre>
        ) : (
          <p style={{ fontSize: "0.9rem", lineHeight: 1.8, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
            {currentRep?.content || currentRep?.mermaid || `${currentTask?.concept || "This concept"} is a core principle in this domain.`}
          </p>
        )}


      </div>

      {/* Micro-quiz */}
      {quiz?.question && (
        <div className="card fade-up" style={{ padding: "1.25rem" }}>
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Quick check
          </p>
          <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "1rem" }}>
            {quiz.question}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {quiz.options?.map((opt) => {
              const isSelected = selectedKey === opt.key;
              const isCorrect = opt.key === quiz.correct_key;
              let cls = "mcq-option";
              if (answered) {
                if (isSelected && isCorrect) cls += " correct";
                else if (isSelected && !isCorrect) cls += " wrong";
                else if (isCorrect) cls += " correct";
                else cls += " disabled";
              }
              return (
                <button
                  key={opt.key}
                  className={cls}
                  onClick={() => handleAnswer(opt.key)}
                  id={`diag-opt-${opt.key}`}
                >
                  <span style={{ fontWeight: 600, marginRight: "0.5rem", opacity: 0.5 }}>{opt.key}.</span>
                  {opt.text}
                </button>
              );
            })}
          </div>

          {answered && (
            <div style={{ marginTop: "1rem" }}>
              <div className={`feedback-box ${selectedKey === quiz.correct_key ? "success" : "error"}`}
                style={{ marginBottom: "0.75rem" }}>
                {selectedKey === quiz.correct_key
                  ? "✓ Correct!"
                  : `✗ The correct answer was ${quiz.correct_key}.`}
                {quiz.explanation && (
                  <p style={{ marginTop: "0.4rem", fontSize: "0.8rem", opacity: 0.85 }}>{quiz.explanation}</p>
                )}
              </div>
              <button
                id="diag-next-btn"
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={handleNext}
              >
                {taskIdx === tasks.length - 1 && modalityIdx === MODALITIES.length - 1
                  ? "See my learner profile →"
                  : "Next →"}
              </button>
            </div>
          )}

          {!answered && !quiz.options?.length && (
            <button className="btn btn-outline" style={{ marginTop: "0.75rem" }} onClick={handleNext}>
              Skip →
            </button>
          )}
        </div>
      )}

      {(!quiz?.question) && (
        <button id="diag-next-btn" className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem" }} onClick={handleNext}>
          Next →
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function IntroScreen({
  topic,
  setTopic,
  onStart,
  loading,
  error,
}: {
  topic: string;
  setTopic: (t: string) => void;
  onStart: () => void;
  loading: boolean;
  error: string;
}) {
  const SUGGESTIONS = ["Machine Learning", "Quantum Computing", "Data Structures", "Macroeconomics"];

  return (
    <div style={{ maxWidth: 620, width: "100%" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <span className="badge badge-blue" style={{ marginBottom: "1rem", display: "inline-block" }}>
          Adaptive Multimodal Assessment
        </span>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem", lineHeight: 1.2 }}>
          What subject do you <br />want to learn?
        </h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
          Enter a topic below. CognifyAI will dynamically generate 3 sub-concepts and test you across 6 learning modalities (text, diagram, example, analogy, audio narration, and code).
        </p>
      </div>

      {/* Topic Input Box */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "0.5rem" }}>
          Target Learning Subject / Topic:
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Machine Learning, Organic Chemistry..."
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--border-color, #30363d)",
            background: "var(--bg-input, #0d1117)",
            color: "var(--text-primary, #fff)",
            fontSize: "1rem",
            marginBottom: "1rem",
          }}
        />
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Quick picks:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="badge"
              onClick={() => setTopic(s)}
              style={{ cursor: "pointer", border: topic === s ? "1px solid #38bdf8" : "1px solid transparent" }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { icon: "📝", label: "Written Explanations" },
          { icon: "📊", label: "Visual Mermaid Diagrams" },
          { icon: "🔬", label: "Real-World Examples" },
          { icon: "💡", label: "Analogy & Metaphors" },
          { icon: "🎙️", label: "Spoken Conversational Scripts" },
          { icon: "💻", label: "Code & Pseudocode" },
        ].map((item) => (
          <div key={item.label} className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 0.9rem" }}>
            <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {error && <div className="feedback-box error" style={{ marginBottom: "1rem" }}>{error}</div>}

      <button
        id="start-onboarding-btn"
        className="btn btn-primary"
        style={{ width: "100%", padding: "0.85rem" }}
        onClick={onStart}
        disabled={loading || !topic.trim()}
      >
        {loading ? <span className="spinner" /> : `Begin Diagnostic for "${topic}" →`}
      </button>
    </div>
  );
}

function LoadingScreen({ topic }: { topic: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
        Deriving sub-concepts and generating 6-modality diagnostic tasks for "{topic}"…
      </p>
    </div>
  );
}

function SubmittingScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Computing your multi-dimensional learner profile…</p>
    </div>
  );
}

function DoneScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
      <h2 style={{ marginBottom: "0.75rem" }}>Your multimodal profile is calibrated!</h2>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: "2rem" }}>
        We've calculated baseline weights across text, visual, example, analogy, auditory, and code representations. All future lessons will dynamically adapt based on these weights.
      </p>
      <button id="go-to-learn-btn" className="btn btn-primary" style={{ width: "100%", padding: "0.85rem" }} onClick={onContinue}>
        Start Adaptive Learning →
      </button>
    </div>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !code) return;
    let cleanCode = code.trim().replace(/^```(?:mermaid)?/i, "").replace(/```$/, "").trim();
    if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap)/i.test(cleanCode)) {
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

        const { svg } = await m.default.render("diag-" + Math.random().toString(36).slice(2), cleanCode);
        if (ref.current) ref.current.innerHTML = svg;
      } catch {
        if (typeof document !== "undefined") {
          document.querySelectorAll(".mermaid-error, [id^='dmermaid'], [id^='d-']").forEach((el) => el.remove());
        }
        if (ref.current) {
          ref.current.innerHTML = `<div style="padding:1rem;background:var(--bg-base);border-radius:6px;font-size:0.8rem;color:var(--text-secondary)"><pre style="font-family:monospace;white-space:pre-wrap">${cleanCode}</pre></div>`;
        }
      }
    }).catch(() => {});
  }, [code]);
  return <div ref={ref} style={{ overflowX: "auto" }} />;
}


function AudioScriptPlayer({ text }: { text: string }) {
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
    <div style={{ padding: "1.25rem", background: "rgba(236, 72, 153, 0.05)", border: "1px solid rgba(236, 72, 153, 0.25)", borderRadius: "var(--radius-md)", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.3rem" }}>🎙️</span>
          <div>
            <h4 style={{ fontSize: "0.88rem", color: "var(--text-primary)", margin: 0 }}>Auditory Spoken Script</h4>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>Listen to the voice narration below</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {!playing ? (
            <button className="btn btn-primary" onClick={handlePlay} style={{ fontSize: "0.8rem", background: "#ec4899", borderColor: "#ec4899", padding: "0.45rem 0.85rem" }}>
              ▶ Play Voice
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={handlePause} style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}>
                ⏸ Pause
              </button>
              <button className="btn btn-outline" onClick={handleStop} style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}>
                ⏹ Stop
              </button>
            </>
          )}
        </div>
      </div>
      <p style={{ fontSize: "0.92rem", lineHeight: 1.8, color: "var(--text-secondary)", whiteSpace: "pre-wrap", fontStyle: "italic" }}>
        "{text}"
      </p>
    </div>
  );
}


