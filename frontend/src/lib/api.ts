// Central API client — all calls to the FastAPI backend go through here
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Get the current Supabase session access token using the official client. */
async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    let { data: { session } } = await supabase.auth.getSession();

    // If session isn't hydrated yet, wait briefly and retry once
    if (!session) {
      await new Promise(r => setTimeout(r, 300));
      ({ data: { session } } = await supabase.auth.getSession());
    }

    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

  const token = await getAuthToken();
  const res = await fetch(`${BASE}/documents/ingest/file`, {
    method: "POST",
    headers: {
      // NOTE: Do NOT set Content-Type here — browser sets it automatically
      // with the correct multipart boundary for FormData.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
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
export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "quiz"; questions: QuizQuestion[] }
  | { type: "web_results"; results: { title: string; url: string; snippet: string }[] }
  | { type: "image_results"; results: { title: string; image: string; thumbnail: string; url: string; source: string }[] }
  | { type: "tool_result"; title: string; data: Record<string, unknown> }
  | { type: "diagram"; diagram: DiagramData };
export type ChatResponse = {
  response: string;
  sources: ChatSource[];
  blocks?: ChatBlock[];
  intent?: string;
  actions?: Record<string, unknown>[];
};

export const sendChatMessage = (body: {
  message: string;
  history: ChatHistoryMessage[];
  topic?: string;
}) => api<ChatResponse>("/chat/message", { method: "POST", body: JSON.stringify(body) });

export type ChatStreamCallbacks = {
  onStatus?: (message: string) => void;
  onIntent?: (intent: string) => void;
  onActions?: (actions: Record<string, unknown>[]) => void;
  onSources: (sources: ChatSource[]) => void;
  onBlock?: (block: ChatBlock) => void;
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (detail: string) => void;
};

export async function sendChatMessageStream(
  body: {
    message: string;
    history: ChatHistoryMessage[];
    topic?: string;
  },
  cbs: ChatStreamCallbacks,
): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${BASE}/chat/message/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    cbs.onError(err.detail ?? "Stream failed");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";

    for (const raw of events) {
      const lines = raw.trim().split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) continue;

      const event = eventLine.slice("event:".length).trim();
      const data = JSON.parse(dataLine.slice("data:".length).trim());

      switch (event) {
        case "status":
          cbs.onStatus?.(data.message ?? "");
          break;
        case "intent":
          cbs.onIntent?.(data.intent ?? "normal");
          break;
        case "actions":
          cbs.onActions?.(data as Record<string, unknown>[]);
          break;
        case "sources":
          cbs.onSources(data as ChatSource[]);
          break;
        case "block":
          cbs.onBlock?.(data as ChatBlock);
          break;
        case "token":
          cbs.onToken(data.text ?? "");
          break;
        case "done":
          cbs.onDone();
          return;
        case "error":
          cbs.onError(data.detail ?? "Stream failed");
          return;
      }
    }
  }
}

// ── Visual Explain ─────────────────────────────────────

export type VisualReference = {
  num: number;
  excerpt: string;
  topic?: string;
  source?: string;
  score: number;
};

export type DiagramNode = {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "circle";
};

export type DiagramEdge = {
  source: string;
  target: string;
  label?: string | null;
  points: [number, number][];
  marker: "arrow" | "none";
};

export type DiagramData = {
  title: string;
  layout_type: string;
  viewbox: { w: number; h: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type TextSection = {
  type: "text";
  heading?: string;
  body: string;
};

export type ImageSection = {
  type: "image";
  caption: string;
  diagram: DiagramData;
  purpose?: string | null;
  placement_reason?: string | null;
};

export type SearchedImageSection = {
  type: "searched_image";
  caption: string;
  title: string;
  image: string;
  thumbnail: string;
  url: string;
  source: string;
  purpose?: string | null;
  placement_reason?: string | null;
};

export type Section = TextSection | ImageSection | SearchedImageSection;

export type VisualResponse = {
  title: string;
  note_type?: string | null;
  sections: Section[];
  references: VisualReference[];
};

export type VisualGenerationStatus = {
  phase: string;
  message: string;
  detail?: string | null;
  current?: number | null;
  total?: number | null;
};

export const visualExplain = (body: {
  concept: string;
  learner_type?: string;
  topic?: string;
}) => api<VisualResponse>("/visual/explain", { method: "POST", body: JSON.stringify(body) });

// ── Streaming visual explain (SSE) ────────────────────────────────────────────

export type StreamCallbacks = {
  onStatus?:    (status: VisualGenerationStatus) => void;
  onTitle:      (title: string | { title: string; note_type?: string | null }) => void;
  onSection:    (section: Section)           => void;
  onReferences: (refs: VisualReference[])    => void;
  onDone:       ()                           => void;
  onError:      (detail: string)             => void;
};

export async function visualExplainStream(
  body: { concept: string; learner_type?: string; topic?: string },
  cbs: StreamCallbacks,
): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${BASE}/visual/explain/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    cbs.onError(err.detail ?? "Stream failed");
    return;
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";           // keep incomplete trailing chunk

    for (const raw of events) {
      const lines     = raw.trim().split("\n");
      const eventLine = lines.find(l => l.startsWith("event:"));
      const dataLine  = lines.find(l => l.startsWith("data:"));
      if (!eventLine || !dataLine) continue;

      const event = eventLine.slice("event:".length).trim();
      const data  = JSON.parse(dataLine.slice("data:".length).trim());

      switch (event) {
        case "status":     cbs.onStatus?.(data as VisualGenerationStatus); break;
        case "title":      cbs.onTitle(data);                  break;
        case "section":    cbs.onSection(data as Section);     break;
        case "references": cbs.onReferences(data.references);  break;
        case "done":       cbs.onDone();                        return;
        case "error":      cbs.onError(data.detail);            return;
      }
    }
  }
}

export type QuickDiagramResponse = { diagram: DiagramData };

export const generateDiagramFromSelection = (body: { text: string }) =>
  api<QuickDiagramResponse>("/visual/diagram", { method: "POST", body: JSON.stringify(body) });

// ── Audio & LiveKit ──────────────────────────────────────────

export type LiveKitTokenResponse = {
  configured: boolean;
  server_url: string;
  room: string;
  participant_name: string;
  token: string | null;
  message?: string;
};

export const getLiveKitToken = (room = "cognify-auditory-room") =>
  api<LiveKitTokenResponse>(`/audio/token?room=${encodeURIComponent(room)}`);


/**
 * Fast auditory query — calls LLM directly via /audio/query, no RAG overhead.
 * Returns a short, spoken-word-friendly answer string.
 */
export const auditoryQuery = (message: string, history?: ChatHistoryMessage[]) =>
  api<{ answer: string }>("/audio/query", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });

export type AuditoryStreamCallbacks = {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (detail: string) => void;
};

export async function auditoryQueryStream(
  message: string,
  history: ChatHistoryMessage[] | undefined,
  cbs: AuditoryStreamCallbacks,
): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${BASE}/audio/query/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    cbs.onError(err.detail ?? "Stream failed");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";

    for (const raw of events) {
      const lines = raw.trim().split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      
      const event = eventLine ? eventLine.slice("event:".length).trim() : "message";
      
      if (!dataLine) continue;
      const dataStr = dataLine.slice("data:".length).trim();
      if (!dataStr) continue;

      const data = JSON.parse(dataStr);

      switch (event) {
        case "message":
          if (data.text) cbs.onToken(data.text);
          break;
        case "done":
          cbs.onDone();
          return;
        case "error":
          cbs.onError(data.detail ?? "Stream failed");
          return;
      }
    }
  }
}

// ── Adaptive Learning ──────────────────────────────────

export type LearnerProfile = {
  user_id: string;
  visual_pref: number;
  text_pref: number;
  example_pref: number;
  analogy_pref: number;
  auditory_pref: number;
  code_pref: number;
  current_skill: number;
  preferred_diff: number;
  needs_repetition: number;
  learning_pace: "slow" | "medium" | "fast";
  onboarding_done: boolean;
  total_sessions: number;
  last_topic: string | null;
  dominant_modality: string;
};

export const getLearnerProfile = () =>
  api<LearnerProfile>("/learning/profile");

export type DiagnosticRepresentation = {
  content?: string;
  mermaid?: string;
  quiz?: Partial<QuizQuestion>;
};

export type DiagnosticTask = {
  concept: string;
  representations: {
    text: DiagnosticRepresentation;
    diagram: DiagnosticRepresentation;
    example: DiagnosticRepresentation;
    analogy: DiagnosticRepresentation;
    auditory?: DiagnosticRepresentation;
    code?: DiagnosticRepresentation;
  };
};

export type OnboardingStartResponse = {
  diagnostic_session_id: string;
  user_topic?: string;
  concepts?: string[];
  tasks: DiagnosticTask[];
};

export const startOnboarding = (user_topic?: string, concepts?: string[]) =>
  api<OnboardingStartResponse>("/learning/onboarding/start", {
    method: "POST",
    body: JSON.stringify({
      user_topic: user_topic || "machine learning",
      concepts: concepts ?? undefined,
    }),
  });

export type DiagnosticSignal = { score: number; avg_ms: number };

export const submitOnboarding = (body: {
  diagnostic_session_id: string;
  signals: Record<string, DiagnosticSignal>;
}) =>
  api<{ message: string; profile: LearnerProfile & { dominant_modality: string } }>(
    "/learning/onboarding/submit",
    { method: "POST", body: JSON.stringify(body) }
  );

export type LessonSection = {
  id: string;
  type: "text" | "diagram" | "example" | "analogy" | "auditory" | "code";
  label: string;
  weight: number;
  content?: string;
  diagram_json?: string;
};

export type AdaptiveLesson = {
  topic: string;
  difficulty: number;
  difficulty_label: string;
  modality_mix: Record<string, number>;
  sections: LessonSection[];
  quiz: QuizQuestion[];
};

export type LessonGenerateResponse = {
  session_id: string;
  plan: Record<string, unknown>;
  lesson: AdaptiveLesson;
  profile_snapshot: {
    visual_pref: number;
    text_pref: number;
    example_pref: number;
    analogy_pref: number;
    auditory_pref: number;
    code_pref: number;
    dominant_modality: string;
    current_skill: number;
    learning_pace: string;
  };
};


export const generateLesson = (topic: string) =>
  api<LessonGenerateResponse>("/learning/lesson/generate", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });

export type LessonCompletePayload = {
  session_id: string;
  topic: string;
  dominant_modality: string;
  quiz_score: number;
  avg_response_ms: number;
  total_attempts?: number;
  correct_attempts?: number;
  modality_scores?: Record<string, number>;
};

export const completeLesson = (body: LessonCompletePayload) =>
  api<{ message: string; updated_profile: LearnerProfile; adaptation: Record<string, unknown> }>(
    "/learning/lesson/complete",
    { method: "POST", body: JSON.stringify(body) }
  );

export type SessionSummary = {
  id: string;
  topic: string;
  quiz_score: number | null;
  avg_response_ms: number | null;
  dominant_modality: string | null;
  started_at: string;
  completed_at: string | null;
};

export const getLessonHistory = () =>
  api<{ sessions: SessionSummary[] }>("/learning/lesson/history");
