/**
 * Stimulus-based multimodal diagnostic modules.
 *
 * Each module tests one cognitive modality by presenting an actual
 * stimulus (narration / diagram / structured text / scenario) and
 * measuring comprehension + response speed.
 */
import { DiagramData } from "@/lib/api";

export type ModalityType = "visual" | "text" | "auditory" | "example";

export interface DiagnosticOption {
  key: string;
  text: string;
  isCorrect: boolean;
}

export interface StructuredTextStimulus {
  heading: string;
  intro?: string;
  items: { label: string; description: string }[];
  closing?: string;
}

export interface DiagnosticModule {
  id: number;
  modality: ModalityType;
  icon: string;
  title: string;
  subtitle: string;
  stimulusType: "auditory" | "visual" | "text" | "scenario";
  // One of the following is populated based on stimulusType
  auditoryText?: string;
  visualDiagram?: DiagramData;
  structuredText?: StructuredTextStimulus;
  scenarioText?: string;
  questionLabel: string;
  question: string;
  options: DiagnosticOption[];
}

export const DIAGNOSTIC_MODULES: DiagnosticModule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // MODULE 1 — Auditory
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 1,
    modality: "auditory",
    icon: "🎧",
    title: "Auditory Module",
    subtitle: "A concept will be explained verbally. Read or listen, then answer.",
    stimulusType: "auditory",
    auditoryText:
      "Imagine your computer as a kitchen. The CPU is the chef — it reads one instruction at a time from a recipe and executes it immediately. RAM is the prep counter, where ingredients (data) sit ready for instant access. The hard drive is the pantry — it holds far more, but fetching from it takes longer. A fast kitchen keeps its most-needed ingredients on the counter, not running to the pantry on every single step.",
    questionLabel: "Based on the explanation:",
    question: "What does RAM represent in this kitchen analogy?",
    options: [
      { key: "A", text: "The chef who reads and executes each instruction", isCorrect: false },
      { key: "B", text: "The prep counter — keeps data close by for quick access", isCorrect: true },
      { key: "C", text: "The pantry — large but slow storage", isCorrect: false },
      { key: "D", text: "The recipe book — the list of instructions to follow", isCorrect: false },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MODULE 2 — Visual
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 2,
    modality: "visual",
    icon: "👁️",
    title: "Visual Module",
    subtitle: "Study the diagram below carefully, then answer the question.",
    stimulusType: "visual",
    visualDiagram: {
      title: "Web Request Lifecycle",
      layout_type: "horizontal",
      viewbox: { w: 680, h: 180 },
      nodes: [
        { id: "browser",   label: "Browser (Client)", color: "#6366f1", x: 10,  y: 65, w: 140, h: 50, shape: "rect" },
        { id: "dns",       label: "DNS Server",       color: "#ec4899", x: 205, y: 65, w: 130, h: 50, shape: "rect" },
        { id: "webserver", label: "Web Server",       color: "#10b981", x: 390, y: 65, w: 130, h: 50, shape: "rect" },
        { id: "database",  label: "Database",         color: "#f59e0b", x: 565, y: 65, w: 105, h: 50, shape: "rect" },
      ],
      edges: [
        { source: "browser",   target: "dns",       label: "1. DNS Lookup",    points: [[150, 90], [205, 90]], marker: "arrow" },
        { source: "dns",       target: "webserver", label: "2. Route Request", points: [[335, 90], [390, 90]], marker: "arrow" },
        { source: "webserver", target: "database",  label: "3. Query DB",      points: [[520, 90], [565, 90]], marker: "arrow" },
      ],
    },
    questionLabel: "Looking at the diagram above:",
    question: "What happens immediately after the DNS Server resolves the address?",
    options: [
      { key: "A", text: "The Database is queried directly by the Browser", isCorrect: false },
      { key: "B", text: "The request is routed to the Web Server", isCorrect: true },
      { key: "C", text: "The Browser immediately receives the final response", isCorrect: false },
      { key: "D", text: "The DNS Server writes the result to the Database", isCorrect: false },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MODULE 3 — Textual
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 3,
    modality: "text",
    icon: "📄",
    title: "Textual Module",
    subtitle: "Read the reference passage below carefully, then answer the question.",
    stimulusType: "text",
    structuredText: {
      heading: "Sorting Algorithms — Key Concepts",
      intro:
        "Sorting algorithms arrange items into a defined order. They differ in execution speed, memory usage, and consistency across input types.",
      items: [
        {
          label: "Time Complexity",
          description:
            "How an algorithm's runtime scales with input size, expressed in Big O notation (e.g. O(n log n)).",
        },
        {
          label: "Bubble Sort",
          description:
            "Repeatedly compares adjacent pairs and swaps them if out of order. Simple, but inefficient for large data — O(n²) worst case.",
        },
        {
          label: "Merge Sort",
          description:
            "Recursively splits the list in half, sorts each half independently, then merges them. Consistent and efficient — O(n log n) in all cases.",
        },
        {
          label: "Stability",
          description:
            "A sort is stable if equal elements maintain their original relative order. Merge Sort is stable; Bubble Sort also is, but at a much higher cost.",
        },
      ],
      closing:
        "Choosing the right algorithm depends on dataset size, memory constraints, and whether stability matters.",
    },
    questionLabel: "Based on the passage above:",
    question: "Why is Merge Sort generally preferred over Bubble Sort for large datasets?",
    options: [
      { key: "A", text: "Merge Sort always uses significantly less memory", isCorrect: false },
      { key: "B", text: "Bubble Sort cannot correctly handle duplicate values", isCorrect: false },
      { key: "C", text: "Merge Sort has better time complexity — O(n log n) vs O(n²)", isCorrect: true },
      { key: "D", text: "Merge Sort is simpler to implement from scratch", isCorrect: false },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MODULE 4 — Applied / Scenario
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 4,
    modality: "example",
    icon: "🔬",
    title: "Applied Module",
    subtitle: "Read this real-world situation. Choose your first course of action.",
    stimulusType: "scenario",
    scenarioText:
      "You are on-call at 3 AM. An alert fires: the production web server response time has spiked from 180ms to 9 seconds. The application is still running. Initial logs show database queries are taking 4–8 seconds each. The query code itself looks correct — the logic has not changed. The database has grown to 2 million rows over 18 months and has never been optimized.",
    questionLabel: "Given this situation:",
    question: "What is the most likely root cause, and what should your first technical action be?",
    options: [
      { key: "A", text: "Out-of-memory crash — restart the database process immediately", isCorrect: false },
      { key: "B", text: "Missing indexes on frequently filtered columns — add the missing indexes", isCorrect: true },
      { key: "C", text: "The table is too large — migrate to a new database engine immediately", isCorrect: false },
      { key: "D", text: "Network latency — move the app server physically closer to the database", isCorrect: false },
    ],
  },
];
