"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { classifyOnboarding, LearnerProfile } from "@/lib/api";
import { DIAGNOSTIC_MODULES, DiagnosticModule, DiagnosticOption } from "@/lib/diagnostic-modules";
import DiagramRenderer from "@/components/DiagramRenderer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleAnswer {
  question_id: number;
  selected_key: string;
  modality: string;
  response_ms: number; // inflated to 12000 if wrong, to penalise backend scoring
}

interface ClassificationResult {
  profile: LearnerProfile;
  dominant_modality: string;
  weights: Record<string, number>;
  weight_string: string;
  delivery_plan: { primary: string; secondary: string };
}

// Stages: 0=intro, 1-4=modules, 5=classifying, 6=results
type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ─── TTS helper ───────────────────────────────────────────────────────────────

function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch {
    // Speech synthesis unavailable in this browser
  }
}

// ─── Stimulus Renderers ───────────────────────────────────────────────────────

function AuditoryStimulus({ module }: { module: DiagnosticModule }) {
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    if (module.auditoryText) {
      setPlaying(true);
      speakText(module.auditoryText);
      // Browser synthesis has no reliable end callback on all browsers — reset after estimate
      const wordCount = module.auditoryText.split(" ").length;
      setTimeout(() => setPlaying(false), (wordCount / 2.5) * 1000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
        padding: "1.25rem",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Tutor avatar row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.1rem",
            flexShrink: 0,
          }}
        >
          🤖
        </div>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
          CognifyAI Tutor
        </span>
        <span
          style={{
            fontSize: "0.68rem",
            background: "rgba(99, 102, 241, 0.12)",
            color: "var(--accent-1)",
            borderRadius: "999px",
            padding: "0.15rem 0.5rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Explanation
        </span>
      </div>

      {/* Chat bubble */}
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "0 var(--radius-md) var(--radius-md) var(--radius-md)",
          padding: "1rem 1.15rem",
          border: "1px solid var(--border)",
          fontSize: "0.9rem",
          lineHeight: 1.65,
          color: "var(--text-primary)",
          position: "relative",
        }}
      >
        {module.auditoryText}
      </div>

      {/* TTS button */}
      <button
        onClick={handlePlay}
        className="btn btn-outline"
        style={{
          alignSelf: "flex-start",
          fontSize: "0.8rem",
          padding: "0.4rem 0.9rem",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        {playing ? (
          <>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--text-muted)" }} />
            Playing...
          </>
        ) : (
          <> ▶ Listen Aloud </>
        )}
      </button>
    </div>
  );
}

function VisualStimulus({ module }: { module: DiagnosticModule }) {
  if (!module.visualDiagram) return null;
  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        overflow: "hidden",
        padding: "1rem",
      }}
    >
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "0.75rem" }}>
        Diagram — {module.visualDiagram.title}
      </p>
      <DiagramRenderer data={module.visualDiagram} />
    </div>
  );
}

function TextStimulus({ module }: { module: DiagnosticModule }) {
  const st = module.structuredText;
  if (!st) return null;
  return (
    <div
      style={{
        padding: "1.25rem 1.5rem",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.7rem", background: "rgba(6, 182, 212, 0.15)", color: "#06b6d4", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Reference Note
        </span>
      </div>

      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
        {st.heading}
      </h3>
      {st.intro && (
        <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
          {st.intro}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {st.items.map((item) => (
          <div key={item.label} style={{ display: "flex", gap: "0.6rem", fontSize: "0.86rem", lineHeight: 1.55 }}>
            <span style={{ color: "var(--accent-1)", fontWeight: 700, flexShrink: 0 }}>
              {item.label}:
            </span>
            <span style={{ color: "var(--text-secondary)" }}>{item.description}</span>
          </div>
        ))}
      </div>
      {st.closing && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", borderTop: "1px solid var(--border)", paddingTop: "0.6rem", margin: 0 }}>
          {st.closing}
        </p>
      )}
    </div>
  );
}

function ScenarioStimulus({ module }: { module: DiagnosticModule }) {
  if (!module.scenarioText) return null;
  return (
    <div
      style={{
        padding: "1.25rem 1.5rem",
        background: "rgba(245, 158, 11, 0.06)",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(245, 158, 11, 0.25)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.7rem", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Real-World Scenario
        </span>
      </div>
      <p style={{ fontSize: "0.9rem", lineHeight: 1.7, color: "var(--text-primary)", margin: 0 }}>
        {module.scenarioText}
      </p>
    </div>
  );
}

// ─── Option Buttons ────────────────────────────────────────────────────────────

function OptionButton({
  opt,
  selectedKey,
  onSelect,
}: {
  opt: DiagnosticOption;
  selectedKey: string | null;
  onSelect: (key: string, isCorrect: boolean) => void;
}) {
  const isSelected = selectedKey === opt.key;
  const isRevealed = selectedKey !== null;
  const showCorrect = isRevealed && opt.isCorrect;
  const showWrong = isRevealed && isSelected && !opt.isCorrect;

  return (
    <button
      type="button"
      onClick={() => !isRevealed && onSelect(opt.key, opt.isCorrect)}
      disabled={isRevealed}
      style={{
        padding: "0.85rem 1.15rem",
        textAlign: "left",
        borderRadius: "var(--radius-md)",
        border: showCorrect
          ? "2px solid var(--accent-success)"
          : showWrong
          ? "2px solid var(--accent-danger, #ef4444)"
          : isSelected
          ? "2px solid var(--accent-1)"
          : "1px solid var(--border)",
        background: showCorrect
          ? "rgba(16, 185, 129, 0.10)"
          : showWrong
          ? "rgba(239, 68, 68, 0.10)"
          : isSelected
          ? "rgba(99, 102, 241, 0.10)"
          : "var(--bg-secondary)",
        cursor: isRevealed ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        transition: "all 0.15s ease",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: showCorrect
            ? "var(--accent-success)"
            : showWrong
            ? "#ef4444"
            : isSelected
            ? "var(--accent-1)"
            : "var(--bg-card)",
          color: showCorrect || showWrong || isSelected ? "#fff" : "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "0.85rem",
          flexShrink: 0,
        }}
      >
        {showCorrect ? "✓" : showWrong ? "✗" : opt.key}
      </span>
      <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", flex: 1, lineHeight: 1.4 }}>
        {opt.text}
      </span>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ModuleAnswer[]>([]);
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState("");
  const questionShownAt = useRef<number>(Date.now());

  // Current module (stage 1-4 maps to DIAGNOSTIC_MODULES[stage-1])
  const currentModule: DiagnosticModule | null =
    stage >= 1 && stage <= 4 ? DIAGNOSTIC_MODULES[stage - 1] : null;

  // Called when entering a module stage
  const enterModule = (s: Stage) => {
    setSelectedKey(null);
    questionShownAt.current = Date.now();
    setStage(s);
  };

  const handleSelectOption = (key: string, isCorrect: boolean) => {
    if (!currentModule) return;
    setSelectedKey(key);

    const response_ms = Date.now() - questionShownAt.current;
    // Penalise wrong answers by inflating response_ms (min speed_factor in backend)
    const effective_ms = isCorrect ? response_ms : 15000;

    const answer: ModuleAnswer = {
      question_id: currentModule.id,
      selected_key: key,
      modality: currentModule.modality,
      response_ms: effective_ms,
    };

    const updatedAnswers = [...answers, answer];

    setTimeout(() => {
      setAnswers(updatedAnswers);
      setSelectedKey(null);

      if (stage < 4) {
        enterModule((stage + 1) as Stage);
      } else {
        // All 4 modules done — classify
        finishClassification(updatedAnswers);
      }
    }, 900);
  };

  const finishClassification = async (allAnswers: ModuleAnswer[]) => {
    setStage(5);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    try {
      const result = await classifyOnboarding({
        answers: allAnswers,
        voice_pref_selected: false,
        preferred_topic: "Multimodal Diagnostic Assessment",
      });
      setClassificationResult({
        profile: result.profile,
        dominant_modality: result.dominant_modality,
        weights: result.weights,
        weight_string: result.weight_string,
        delivery_plan: result.delivery_plan,
      });
      setStage(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to classify learner profile.");
      setStage(0);
    }
  };

  const resetAssessment = () => {
    setStage(0);
    setSelectedKey(null);
    setAnswers([]);
    setClassificationResult(null);
    setError("");
  };

  // ── Progress indicator for module stages ──────────────────────────────────
  const moduleProgress = stage >= 1 && stage <= 4 ? stage : 0;

  return (
    <div style={{ maxWidth: 860, width: "100%", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <span className="badge badge-purple">CognifyAI Diagnostic</span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Multimodal Learner Calibration
          </span>
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
          Identify Your Learner Type
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Four distinct modules — Auditory, Visual, Textual, and Applied — each tests how well you engage with one learning style.
        </p>
      </div>

      {error && (
        <div className="feedback-box error" style={{ marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {/* ── STAGE 0: Intro ─────────────────────────────────────────────── */}
      {stage === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              padding: "1.75rem",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
              Instead of asking what you <em>prefer</em>, this diagnostic actually <strong>tests how you perform</strong> in each learning style. Each module gives you a real stimulus and measures your comprehension and response speed.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
              {DIAGNOSTIC_MODULES.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "1rem",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>{m.icon}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {m.title}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    {m.subtitle}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary"
                onClick={() => enterModule(1)}
                style={{ padding: "0.7rem 1.75rem", fontSize: "0.9rem", fontWeight: 700 }}
              >
                Begin Diagnostic →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 1–4: Modules ─────────────────────────────────────────── */}
      {stage >= 1 && stage <= 4 && currentModule && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Module progress bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              {DIAGNOSTIC_MODULES.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "var(--radius-sm)",
                    background:
                      i + 1 < stage
                        ? "var(--accent-success)"
                        : i + 1 === stage
                        ? "var(--accent-1)"
                        : "var(--bg-secondary)",
                    border: i + 1 === stage ? "2px solid var(--accent-1)" : "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: i + 1 < stage ? "0.75rem" : "0.9rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  {i + 1 < stage ? "✓" : m.icon}
                </div>
              ))}
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--accent-1)", fontFamily: "ui-monospace", fontWeight: 700 }}>
              {moduleProgress} / 4
            </span>
          </div>

          {/* Module header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.75rem 1rem",
              background: "rgba(99, 102, 241, 0.06)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
            }}
          >
            <span style={{ fontSize: "1.4rem" }}>{currentModule.icon}</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                {currentModule.title}
              </p>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {currentModule.subtitle}
              </p>
            </div>
          </div>

          {/* Stimulus */}
          {currentModule.stimulusType === "auditory" && <AuditoryStimulus module={currentModule} />}
          {currentModule.stimulusType === "visual" && <VisualStimulus module={currentModule} />}
          {currentModule.stimulusType === "text" && <TextStimulus module={currentModule} />}
          {currentModule.stimulusType === "scenario" && <ScenarioStimulus module={currentModule} />}

          {/* Question card */}
          <div
            style={{
              padding: "1.5rem",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {currentModule.questionLabel && (
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, margin: 0 }}>
                {currentModule.questionLabel}
              </p>
            )}
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.45, margin: 0 }}>
              {currentModule.question}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {currentModule.options.map((opt) => (
                <OptionButton
                  key={opt.key}
                  opt={opt}
                  selectedKey={selectedKey}
                  onSelect={handleSelectOption}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 5: Classifying ───────────────────────────────────────── */}
      {stage === 5 && (
        <div
          style={{
            padding: "4rem 2rem",
            background: "var(--bg-card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div className="spinner" style={{ width: 36, height: 36 }} />
          <h2 style={{ fontSize: "1.25rem", color: "var(--text-primary)" }}>
            Calibrating Your Cognitive Profile…
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: 440 }}>
            Weighing comprehension scores and response speeds across all four modalities.
          </p>
        </div>
      )}

      {/* ── STAGE 6: Results ───────────────────────────────────────────── */}
      {stage === 6 && classificationResult && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              padding: "2rem",
              background: "radial-gradient(ellipse at top, rgba(99, 102, 241, 0.15) 0%, var(--bg-card) 70%)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            {/* Dominant result */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <span className="badge badge-purple" style={{ marginBottom: "0.5rem", display: "inline-block" }}>
                  Cognitive Type Identified
                </span>
                <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "0.2rem 0", color: "var(--text-primary)" }}>
                  {classificationResult.dominant_modality.toUpperCase()} DOMINANT
                </h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
                  Ratio Formula:{" "}
                  <code style={{ color: "var(--accent-1)", fontWeight: 700 }}>
                    {classificationResult.weight_string}
                  </code>
                </p>
              </div>
              <span style={{ fontSize: "2.4rem" }}>
                {classificationResult.dominant_modality === "auditory"
                  ? "🎧"
                  : classificationResult.dominant_modality === "visual"
                  ? "👁️"
                  : classificationResult.dominant_modality === "text"
                  ? "📄"
                  : "🔬"}
              </span>
            </div>

            {/* Delivery plan */}
            <div
              style={{
                padding: "1.25rem",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
              }}
            >
              <h3 style={{ fontSize: "0.92rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
                🎯 How CognifyAI Will Deliver Your Content:
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <li style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <span>🎯</span>
                  <span><strong>Primary:</strong> {classificationResult.delivery_plan.primary}</span>
                </li>
                <li style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <span>📊</span>
                  <span><strong>Supporting:</strong> {classificationResult.delivery_plan.secondary}</span>
                </li>
              </ul>
            </div>

            {/* Weights grid */}
            <div>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.6rem", textTransform: "uppercase" }}>
                Performance-Based Cognitive Blend
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem" }}>
                {[
                  { key: "auditory", label: "Auditory", pct: classificationResult.weights.auditory || 0, color: "#ec4899", icon: "🎧" },
                  { key: "visual",   label: "Visual",   pct: classificationResult.weights.visual   || 0, color: "#8b5cf6", icon: "👁️" },
                  { key: "text",     label: "Textual",  pct: classificationResult.weights.text     || 0, color: "#06b6d4", icon: "📄" },
                  { key: "example",  label: "Applied",  pct: classificationResult.weights.example  || 0, color: "#10b981", icon: "🔬" },
                ].map((item) => (
                  <div
                    key={item.key}
                    style={{
                      padding: "0.85rem",
                      background: "var(--bg-card)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ fontSize: "1.2rem", display: "block", marginBottom: "0.2rem" }}>{item.icon}</span>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: item.color, display: "block" }}>
                      {item.pct}%
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={resetAssessment}
                className="btn btn-outline"
                style={{ fontSize: "0.85rem" }}
              >
                Recalibrate
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard/learn?welcome=true")}
                className="btn btn-primary"
                style={{ fontSize: "0.85rem", fontWeight: 700, padding: "0.6rem 1.25rem" }}
              >
                Start Adaptive Lesson →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
