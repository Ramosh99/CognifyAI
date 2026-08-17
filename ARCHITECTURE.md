# CognifyAI Architecture

CognifyAI is a RAG-based adaptive learning platform. It combines a Next.js frontend, a FastAPI backend, Supabase authentication, Supabase/PostgreSQL with pgvector, a remote embedding service, Gemini-based LLM workflows, and a LangGraph tutor agent.

## High-Level Architecture

```mermaid
flowchart LR
  U[User] --> FE[Next.js Frontend]
  FE -->|Supabase Auth| SBAuth[Supabase Auth]
  FE -->|Bearer JWT + API calls| API[FastAPI Backend]

  API --> Agent[LangGraph Agent Service]
  API --> RAG[RAG Service]
  API --> LLM[Gemini LLM Service]
  API --> Visual[Visual / Note Composer Pipeline]

  RAG --> EmbedAPI[Remote Embedding Service]
  EmbedAPI --> BGE[BAAI/bge-base-en-v1.5]

  RAG --> Supabase[(Supabase Postgres + pgvector)]
  Agent --> Tools[Chat Tools]
  Tools --> RAG
  Tools --> LLM
  Tools --> Web[DuckDuckGo / Wikimedia / Wikipedia]
  Tools --> MCP[MCP Placeholder]

  Visual --> Research[Research Topic Agent]
  Research --> Wiki[Wikipedia]
  Research --> Web
  Visual --> Diagram[Visual Diagram Pipeline]
  Diagram --> LLM
  Diagram --> Layout[Layout Solver]
```

## Main Components

| Layer | Technology | Role |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind | Dashboard UI, chat, uploads, quiz, visual explanations |
| Auth | Supabase Auth | Login/session handling; frontend sends access token to backend |
| Backend API | FastAPI | REST + SSE API for documents, chat, learning, visual explanations |
| Agent Orchestration | LangGraph | Routes chat requests into study, quiz, analyze, visual, web/image search, MCP placeholder |
| LLM | Gemini API | Routing, chat, quiz generation, misconception analysis, note writing, diagram planning |
| RAG | Supabase + pgvector | Stores document chunks and performs semantic search |
| Embeddings | Hugging Face Space microservice | Remote `BAAI/bge-base-en-v1.5` embeddings |
| Voice / Auditory | LiveKit Cloud / `livekit-api` | Real-time WebRTC room token issuance & audio tutor room |
| External Search | DuckDuckGo, Wikimedia Commons, Wikipedia | Web/image/research enrichment |
| MCP | Placeholder backend node | Intent exists, but no real MCP connector adapter is wired yet |

## Important Files

| Area | File |
|---|---|
| Backend entry | `backend/app/main.py` |
| Agent graph | `backend/app/services/agent_service.py` |
| RAG service | `backend/app/services/rag_service.py` |
| Embedding client | `backend/app/services/embedding_service.py` |
| LLM service | `backend/app/services/llm_service.py` |
| Database schema | `backend/supabase_migration.sql` |
| Frontend API client | `frontend/src/lib/api.ts` |
| Frontend Supabase client | `frontend/src/lib/supabase/client.ts` |
| Embedding microservice | `embedding-space/cognify-embedding/app.py` |

## Backend API Surface

```mermaid
flowchart TB
  FastAPI[FastAPI app.main] --> Documents[/documents/]
  FastAPI --> Chat[/chat/]
  FastAPI --> Learning[/learning/]
  FastAPI --> Visual[/visual/]
  FastAPI --> AgentAPI[/agent/]

  Documents --> IngestText[POST ingest/text]
  Documents --> IngestFile[POST ingest/file]
  Documents --> Search[POST search]

  Chat --> ChatMsg[POST message]
  Chat --> ChatStream[POST message/stream SSE]

  Learning --> Quiz[POST generate-quiz]
  Learning --> Analyze[POST analyze-answer]

  Visual --> Explain[POST explain]
  Visual --> ExplainStream[POST explain/stream SSE]
  Visual --> Diagram[POST diagram]

  AgentAPI --> AgentMsg[POST message]
```

## Agent Workflow

The backend agent is implemented in `backend/app/services/agent_service.py`. It uses LangGraph when available, and has a fallback imperative runner if LangGraph is not installed.

```mermaid
flowchart TD
  Start[User Message] --> Route[LLM Router Node]

  Route -->|normal| Normal[Normal Chat Node]
  Route -->|web_search| WebSearch[Web Search Node]
  Route -->|image_search| ImageSearch[Image Search Node]
  Route -->|mcp_action| MCP[MCP Action Node]
  Route -->|multi_tool| Multi[Multi Tool Node]

  Route -->|study / quiz / analyze / visual| Retrieve[RAG Retrieve Node]

  Retrieve -->|study| Study[Study Answer Node]
  Retrieve -->|quiz| Quiz[Quiz Generation Node]
  Retrieve -->|analyze| Analyze[Misconception Analysis Node]
  Retrieve -->|visual| Visual[Visual Answer Node]

  Normal --> End[Response]
  WebSearch --> End
  ImageSearch --> End
  MCP --> End
  Multi --> End
  Study --> End
  Quiz --> End
  Analyze --> End
  Visual --> End
```

Agent intents:

- `normal`
- `study`
- `quiz`
- `analyze`
- `visual`
- `web_search`
- `image_search`
- `mcp_action`
- `multi_tool`

The `mcp_action` route exists, but `backend/app/agents/chat_tools/mcp.py` currently returns a setup-pending response. There is no live MCP connector adapter wired into the FastAPI backend yet.

## RAG / Document Workflow

### Ingestion

```mermaid
sequenceDiagram
  participant User
  participant FE as Next.js Frontend
  participant API as FastAPI Documents API
  participant RAG as RAG Service
  participant EMB as Embedding Space
  participant DB as Supabase pgvector

  User->>FE: Upload PDF/TXT or paste text
  FE->>API: POST /documents/ingest/*
  API->>RAG: ingest(text, user_id, metadata)
  RAG->>RAG: Split text into chunks
  RAG->>EMB: /embed/batch
  EMB-->>RAG: 768-dim vectors
  RAG->>DB: Insert chunks + embeddings + user_id
  DB-->>RAG: Stored
  RAG-->>API: chunks_stored
  API-->>FE: Ingest response
```

### Semantic Search

```mermaid
sequenceDiagram
  participant FE
  participant API
  participant RAG
  participant EMB
  participant DB

  FE->>API: POST /documents/search
  API->>RAG: retrieve(query, user_id, top_k)
  RAG->>EMB: /embed query
  EMB-->>RAG: query vector
  RAG->>DB: RPC match_documents
  DB-->>RAG: top similar chunks
  RAG-->>API: text, score, topic, source
  API-->>FE: Search results
```

## Database Model

The Supabase migration is defined in `backend/supabase_migration.sql`.

```mermaid
erDiagram
  documents {
    uuid id PK
    uuid user_id
    text text
    varchar topic
    varchar source
    vector embedding
    timestamptz created_at
  }

  users {
    uuid id PK
    varchar name
    varchar learner_type
    timestamptz created_at
  }

  quiz_sessions {
    uuid id PK
    uuid user_id FK
    varchar topic
    varchar learner_type
    timestamptz created_at
  }

  quiz_attempts {
    uuid id PK
    uuid session_id FK
    text question
    text selected_answer
    text correct_answer
    boolean is_correct
    varchar misconception_tag
    timestamptz created_at
  }

  users ||--o{ quiz_sessions : has
  quiz_sessions ||--o{ quiz_attempts : contains
```

The key database function is `match_documents(...)`, which performs cosine similarity search using pgvector and filters by `user_id`.

## Visual Explanation Workflow

```mermaid
flowchart TD
  Request[Visual Explain Request] --> RAG[RAG retrieve user docs]
  Request --> Research[Research topic]
  Research --> Wiki[Wikipedia summary]
  Research --> DDG[DuckDuckGo fallback]

  RAG --> Context[Numbered source context]
  Wiki --> Context
  DDG --> Context

  Context --> Composer[Note Composer Agent]
  Composer --> LLM[Gemini writes structured note JSON]
  LLM --> Plan[Visual plan]

  Plan --> DiagramSlot{Visual type}
  DiagramSlot -->|diagram| DiagramPipeline[Diagram Pipeline]
  DiagramSlot -->|searched_image| ImageSearch[Wikimedia / DuckDuckGo Images]

  DiagramPipeline --> DiagramLLM[LLM diagram planner]
  DiagramLLM --> Validate[Validate/fallback plan]
  Validate --> Layout[Layout engine]
  Layout --> DiagramData[DiagramData JSON]

  ImageSearch --> Sections[Interleaved note sections]
  DiagramData --> Sections
  Sections --> Response[VisualResponse or SSE stream]
```

## Embedding Microservice

The embedding service is a separate FastAPI app under `embedding-space/cognify-embedding/app.py`.

It loads:

```text
BAAI/bge-base-en-v1.5
```

Endpoints:

- `GET /health`
- `POST /embed`
- `POST /embed/batch`

The main backend does not load `torch`, `transformers`, or `sentence-transformers` directly. It calls the remote embedding service through `EMBEDDING_SERVICE_URL`.

## Agent Tools

| Tool | File | What it does |
|---|---|---|
| Router | `backend/app/agents/chat_tools/router.py` | Uses Gemini to classify user intent |
| Retrieval | `backend/app/agents/chat_tools/retrieval.py` | Pulls user-scoped RAG context |
| Normal chat | `backend/app/agents/chat_tools/normal.py` | General conversation |
| Tutoring/study | `backend/app/agents/chat_tools/tutoring.py` | RAG-grounded explanation |
| Quiz | `backend/app/agents/chat_tools/quiz.py` | Generates MCQs |
| Analysis | `backend/app/agents/chat_tools/analysis.py` | Misconception feedback |
| Visual | `backend/app/agents/chat_tools/visual.py` | Diagram/visual response |
| Web search | `backend/app/agents/chat_tools/web_search.py` | DuckDuckGo text search |
| Image search | `backend/app/agents/chat_tools/image_search.py` | DuckDuckGo + Wikimedia images |
| MCP | `backend/app/agents/chat_tools/mcp.py` | Placeholder only; no live connector adapter yet |

## Deployment Shape

```mermaid
flowchart LR
  Browser[Browser] --> Frontend[Next.js App]
  Frontend --> Backend[FastAPI Backend Space / Server]
  Backend --> Gemini[Google Gemini API]
  Backend --> Supabase[Supabase Auth + Postgres + pgvector]
  Backend --> EmbeddingSpace[HF Embedding Space]
  Backend --> PublicWeb[Wikipedia / DuckDuckGo / Wikimedia]

  EmbeddingSpace --> Model[BAAI/bge-base-en-v1.5]
```

## Summary

CognifyAI is structured as a full-stack AI learning platform. The frontend authenticates users with Supabase and sends bearer-token API requests to FastAPI. The backend validates Supabase JWTs, retrieves or stores user-scoped learning documents, calls a remote embedding service for vector representations, searches Supabase pgvector data, and uses Gemini for chat, routing, quiz generation, misconception analysis, visual-note composition, and diagram planning.

The strongest implemented workflows are:

- Document ingestion and semantic search
- RAG-grounded chat
- Adaptive quiz generation
- Misconception analysis
- Visual note generation with diagrams/images
- Web and image search enrichment

MCP support is represented architecturally, but it is currently a placeholder and needs a backend connector adapter before it can call real private tools.
