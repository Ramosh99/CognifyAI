// Central API client — all calls to the FastAPI backend go through here
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Documents ──────────────────────────────────────────

export type IngestResponse = { message: string; chunks_stored: number };
export type SearchResult   = { text: string; score: number; topic?: string; source?: string };
export type SearchResponse = { query: string; results: SearchResult[] };

export const ingestText = (body: { text: string; topic?: string; source?: string }) =>
  api<IngestResponse>("/documents/ingest/text", { method: "POST", body: JSON.stringify(body) });

export async function ingestFile(file: File, topic?: string): Promise<IngestResponse> {
  const form = new FormData();
  form.append("file", file);
  if (topic) form.append("topic", topic);
  const res = await fetch(`${BASE}/documents/ingest/file`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json();
}

export const searchDocuments = (body: { query: string; top_k?: number; filter_topic?: string | null }) =>
  api<SearchResponse>("/documents/search", { method: "POST", body: JSON.stringify(body) });

// ── Learning ───────────────────────────────────────────

export type MCQOption = { key: string; text: string; concept_tag?: string };
export type QuizQuestion = {
  question: string;
  options: MCQOption[];
  correct_key: string;
  explanation?: string;
};
export type QuizResponse = { topic: string; learner_type: string; questions: QuizQuestion[] };

export const generateQuiz = (body: { topic: string; learner_type: string; question_count?: number }) =>
  api<QuizResponse>("/learning/generate-quiz", { method: "POST", body: JSON.stringify(body) });

export type AnalyzeResponse = { feedback: string };
export const analyzeAnswer = (body: {
  question: string;
  wrong_answer: string;
  correct_answer: string;
  topic: string;
}) => api<AnalyzeResponse>("/learning/analyze-answer", { method: "POST", body: JSON.stringify(body) });

// ── Chat ───────────────────────────────────────────────

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };
export type ChatSource = { text: string; score: number; topic?: string; source?: string };
export type ChatResponse = { response: string; sources: ChatSource[] };

export const sendChatMessage = (body: {
  message: string;
  history: ChatHistoryMessage[];
  topic?: string;
}) => api<ChatResponse>("/chat/message", { method: "POST", body: JSON.stringify(body) });

// ── Visual Explain ─────────────────────────────────────

export type VisualReference = {
  num: number;
  excerpt: string;
  topic?: string;
  source?: string;
  score: number;
};

export type DiagramNode = { label: string; color: string };
export type DiagramData = {
  diagram_type: "hub_spoke" | "flow" | "cycle" | string;
  center: string;
  nodes: DiagramNode[];
};

export type VisualResponse = {
  title: string;
  explanation: string;
  highlights: string[];
  references: VisualReference[];
  diagram: DiagramData;
};

export const visualExplain = (body: {
  concept: string;
  learner_type?: string;
  topic?: string;
}) => api<VisualResponse>("/visual/explain", { method: "POST", body: JSON.stringify(body) });
