# CognifyAI — System Architecture

CognifyAI is a multimodal adaptive learning platform. It ingests raw knowledge (PDFs, web data), dynamically generates personalized learning materials across Visual, Textual, and Auditory modalities, and orchestrates complex RAG workflows backed by a LangGraph agent engine.

---

## System Overview

```mermaid
graph TD
    User([Learner]) --> FE[Next.js Frontend]

    FE -- REST / SSE --> API[FastAPI Backend]
    FE -- WebRTC --> LK[LiveKit Voice Server]
    FE -- Auth --> SB_AUTH[Supabase Auth]

    API --> AgentSvc[Agent Service\nLangGraph StateGraph]
    API --> RAGSvc[RAG Pipeline]
    API --> LearnSvc[Learning Services]
    API --> DB[(Supabase\nPostgreSQL + pgvector)]

    AgentSvc --> Router[Intent Router\n9 intents]
    Router --> Tools[Specialized Tool Nodes]
    Tools --> RAGSvc
    Tools --> LLMSvc[Gemini LLM Service]
    Tools --> WebSearch[DuckDuckGo / Brave]

    RAGSvc --> EmbedMS[HuggingFace\nEmbedding Microservice\nBAAI/bge-base-en-v1.5]
    RAGSvc --> DB

    LearnSvc --> ProfileSvc[Learner Profile\nEMA Engine]
    LearnSvc --> LessonSvc[Lesson Planner]
    LearnSvc --> ContentEng[Content Engine]
```

---

## 1. Enterprise RAG Module

**What it does:** Ingests documents, retrieves highly relevant context via hybrid search, and validates AI answers to prevent hallucinations.

### Contains

| File | Role |
|------|------|
| `services/chunking_service.py` | Hierarchical AST-based PDF chunking with breadcrumb enrichment; preserves heading parent-child relationships |
| `services/embedding_service.py` | Remote client to HuggingFace embedding microservice — no local torch/transformers |
| `services/rag_service.py` | Hybrid Retrieval (dense + sparse) merged via Reciprocal Rank Fusion (RRF) |
| `services/rerank_service.py` | Cross-attention reranking, filters chunks below 0.55 relevance threshold |
| `services/validation_service.py` | Self-correcting layer — cross-references LLM output against retrieved chunks to detect/fix hallucinations |
| `agents/chat_tools/retrieval.py` | Intent-aware top_k adjustment and document retrieval orchestration |
| `agents/chat_tools/query_planner.py` | Transforms user messages into optimised retrieval queries for doc + web search |
| `agents/note_composer_agent.py` | Consumes RAG context, emits structured multimodal study notes (text + diagrams + images) with citations |
| `agents/research_note_graph.py` | LangGraph topology: classifies topic sensitivity (medical/legal/finance) and triggers external web search when RAG confidence is low |
| `embedding-space/cognify-embedding/app.py` | Standalone HuggingFace Space — BAAI/bge-base-en-v1.5, 768-dim embeddings |

### Pipeline Flow

```mermaid
sequenceDiagram
    participant U as User Query
    participant QP as query_planner
    participant R as rag_service
    participant ES as Embedding MS
    participant DB as pgvector DB
    participant RR as rerank_service
    participant NC as note_composer_agent
    participant V as validation_service

    U->>QP: Raw user message
    QP-->>R: Optimised retrieval query
    R->>ES: Embed query (remote HF Space)
    ES-->>R: 768-dim dense vector
    R->>DB: Dense similarity search (pgvector)
    R->>DB: Sparse keyword search (tsvector)
    DB-->>R: Top-N chunks (both methods)
    R->>R: Reciprocal Rank Fusion merge
    R->>RR: Re-rank merged chunks
    RR-->>R: Top-K high-fidelity chunks (≥0.55)
    R->>NC: Chunks + topic metadata
    NC->>V: Draft multimodal notes
    V-->>U: Hallucination-checked, cited output
```

### Document Ingestion Flow

```mermaid
flowchart LR
    PDF[PDF Upload] --> OCR[Text Extraction]
    OCR --> Chunk[chunking_service\nAST Hierarchical Split]
    Chunk --> Breadcrumb[Breadcrumb Enrichment\nHeading Path]
    Breadcrumb --> Embed[embedding_service\nRemote HF Space]
    Embed --> Store[(pgvector\n768-dim chunks)]
```

### Research Note Graph (Sensitivity-Aware)

```mermaid
flowchart TD
    Topic[Topic Input] --> Classify{research_note_graph\nSensitivity Classifier}
    Classify -- low / general_education --> RAGOnly[RAG Context Only]
    Classify -- medium / high\nmedical, legal, finance --> WebTrigger[External Search\nDuckDuckGo + Wikipedia]
    WebTrigger --> Merge[Merge RAG + Web Context]
    RAGOnly --> Compose[note_composer_agent]
    Merge --> Compose
    Compose --> Notes[Structured Study Notes\nwith Citations]
```

---

## 2. LangGraph Agent Orchestration Module

**What it does:** Routes every user message to the correct specialised agent pipeline via a LangGraph StateGraph with 9 classified intents.

### Contains

| File | Role |
|------|------|
| `services/agent_service.py` | Root LangGraph StateGraph — intent detection, node routing, state management |
| `agents/chat_tools/router.py` | Classifies user messages into 9 intents |
| `agents/chat_tools/normal.py` | Handles greetings, small-talk, app help — no RAG involved |
| `agents/chat_tools/tutoring.py` | Educational explanations with grounded RAG context |
| `agents/chat_tools/quiz.py` | Quiz generation with calibrated difficulty |
| `agents/chat_tools/visual.py` | Diagram and visual explanation generation |
| `agents/chat_tools/web_search.py` | DuckDuckGo external knowledge search |
| `agents/chat_tools/image_search.py` | Image retrieval for visual references |
| `agents/chat_tools/mcp.py` | MCP connectors — calendar, Drive, Docs, email |
| `agents/chat_tools/analysis.py` | Misconception analysis and targeted feedback on wrong quiz answers |

### Agent Routing Flow

```mermaid
flowchart TD
    Msg[User Message] --> Router[router.py\nIntent Classifier]

    Router -- normal --> Normal[normal.py\nGreetings / Help]
    Router -- study --> Tutor[tutoring.py\nRAG-grounded Explanation]
    Router -- quiz --> Quiz[quiz.py\nAdaptive Quiz Generation]
    Router -- analyze --> Analyze[analysis.py\nMisconception Feedback]
    Router -- visual --> Visual[visual.py\nDiagram Generation]
    Router -- web_search --> WebS[web_search.py\nDuckDuckGo]
    Router -- image_search --> ImgS[image_search.py\nImage Retrieval]
    Router -- mcp_action --> MCP[mcp.py\nCalendar / Drive / Docs]
    Router -- multi_tool --> Multi[Multi-node\nComposed Pipeline]

    Tutor --> RAG[rag_service]
    Quiz --> RAG
    Analyze --> RAG
    Visual --> VisualPipeline[visual_tools pipeline]

    RAG --> LLM[llm_service\nGemini]
    VisualPipeline --> LLM
    Normal --> LLM
```

---

## 3. Voice & Auditory Support Module

**What it does:** Provides real-time conversational learning via WebRTC, text-to-speech for study notes, and low-latency voice chat with a streaming AI tutor.

### Contains

| File | Role |
|------|------|
| `api/endpoints/audio.py` | `/audio/query` and `/audio/query/stream` — voice-optimised endpoints with short, no-markdown, conversational responses |
| `core/config.py` | LiveKit URL, API key, and API secret configuration |
| `dashboard/auditory/page.tsx` | Frontend voice tutor UI — microphone input, real-time AI response, playback |
| Browser `window.speechSynthesis` | Native TTS — no backend ML models required; keeps backend serverless-compatible |
| LiveKit WebRTC | Ultra-low-latency real-time audio streaming infrastructure |

### Voice Architecture

```mermaid
sequenceDiagram
    participant L as Learner (Browser)
    participant FE as auditory/page.tsx
    participant LK as LiveKit WebRTC
    participant API as audio.py
    participant LLM as llm_service (Gemini)
    participant TTS as window.speechSynthesis

    L->>FE: Speaks (microphone)
    FE->>LK: WebRTC audio stream
    LK->>API: Transcribed text
    API->>LLM: Auditory system prompt\n(short, no markdown, conversational)
    LLM-->>API: Streaming text response
    API-->>FE: SSE token stream
    FE->>TTS: Text chunks
    TTS-->>L: Spoken audio response
```

### Why No Backend TTS/STT Models

```mermaid
flowchart LR
    subgraph Removed
        Torch[PyTorch / Audio8\nHeavy ML Models]
    end
    subgraph Used
        LiveKit[LiveKit WebRTC\nLow-latency streaming]
        BrowserTTS[Browser speechSynthesis\nNative, zero-latency]
    end
    Removed -. replaced by .-> Used
```

> **Design decision:** Heavy local ML models (torch, transformers) were removed to keep the backend serverless-friendly and horizontally scalable. The browser's native `speechSynthesis` API provides resilient, zero-dependency TTS.

---

## 4. Visual & Diagram Support Module

**What it does:** Translates text concepts into interactive visual structures — mind maps, flowcharts, and canvases — rendered live in the browser.

### Contains

| File | Role |
|------|------|
| `agents/visual_tools/planner.py` | Plans diagram structure and node hierarchy from a text description |
| `agents/visual_tools/validator.py` | Validates diagram AST; provides fallback plan if LLM output is malformed |
| `agents/visual_tools/layout.py` | Force-directed Dagre layout — positions nodes and edges on canvas |
| `agents/visual_tools/pipeline.py` | Orchestrates: plan → validate → layout in sequence |
| `agents/visual_tools/schemas.py` | Pydantic models for nodes, edges, and styles |
| `agents/visual_tools/icon_manifest.py` | Shape and icon definitions for rendering |
| `services/layout_solver.py` | Dagre graph layout solver (backend wrapper) |
| `api/endpoints/visual.py` | `/visual/explain` and `/visual/diagram` REST endpoints |
| `components/DiagramRenderer.tsx` | Mermaid.js React wrapper — renders AST as interactive canvas |
| `dashboard/visual/page.tsx` | Visual learner dashboard UI |

### Visual Generation Pipeline

```mermaid
flowchart LR
    Q[User Query] --> Planner[visual_tools/planner\nDiagram Plan]
    Planner --> Validator{visual_tools/validator\nAST Valid?}
    Validator -- yes --> Layout[visual_tools/layout\nDagre Positioning]
    Validator -- no --> Fallback[Fallback Plan]
    Fallback --> Layout
    Layout --> Schema[schemas.py\nNodes + Edges + Styles]
    Schema --> FE[DiagramRenderer.tsx\nMermaid.js Canvas]
    FE --> User([Interactive Diagram])
```

---

## 5. Adaptive Learning Services Module

**What it does:** Tracks each learner's evolving preferences across 10 dimensions, plans personalised lessons, and generates calibrated multimodal content.

### Contains

| File | Role |
|------|------|
| `services/learner_profile_service.py` | EMA-based dynamic learner model — 10 preference dimensions updated after each session |
| `services/lesson_planner_service.py` | Transforms learner profile into a concrete lesson plan (modality mix + difficulty + quiz count) |
| `services/content_engine_service.py` | Generates the full adaptive lesson payload: text, diagrams, examples, analogies, MCQs |
| `services/context_service.py` | Aggregates context from RAG output, learner history, and topic metadata |
| `api/endpoints/learning.py` | `/learning/profile`, `/learning/onboarding/*`, `/learning/lesson/*`, `/learning/generate-quiz`, `/learning/analyze-answer` |
| `agents/quiz_tools/validator.py` | Validates quiz question format and answer correctness |

### Adaptive Learning Loop

```mermaid
flowchart TD
    OB[Onboarding\nModality Detection] --> Profile[learner_profile_service\n10-dim EMA Model]

    Profile --> LP[lesson_planner_service\nModality Mix + Difficulty]
    LP --> CE[content_engine_service]

    CE --> TXT[Text Explanation\nGemini LLM]
    CE --> DGM[Diagram Section\nVisual Pipeline]
    CE --> EX[Examples + Analogies]
    CE --> QZ[Quiz MCQs\nCalibrated Difficulty]

    TXT & DGM & EX & QZ --> Lesson[Multimodal Lesson\nDelivered via SSE]

    Lesson --> Learner([Learner])
    Learner -- Score + Response Time --> Update[Profile EMA Update\nnew = old×0.7 + signal×0.3]
    Update --> Profile
```

### Learner Profile Dimensions

```mermaid
mindmap
  root((Learner Profile))
    Modality
      visual
      textual
      auditory
      code
    Content Style
      examples
      analogies
      repetition
    Difficulty
      skill_level
      difficulty_preference
    Pace
      pace_classification
        slow
        medium
        fast
```

---

## 6. Frontend Application Modules

**What it does:** Next.js 15 app partitioned into distinct learning modalities, real-time streaming views, and utility pages.

### Page Map

```mermaid
flowchart TD
    Landing[app/page.tsx\nMarketing / Landing]
    Landing --> Login[auth/login\nSupabase Auth]
    Login --> DB[dashboard/layout.tsx\nSidebar + Providers]

    DB --> Learn[/learn\nRAG Notes + SSE Stream + Citations]
    DB --> Chat[/chat\nDocument Chat Interface]
    DB --> Visual[/visual\nDiagram Canvas]
    DB --> Auditory[/auditory\nVoice Tutor + WebRTC]
    DB --> Quiz[/quiz\nAdaptive Testing]
    DB --> Upload[/upload\nPDF Ingestion]
    DB --> Analytics[/analytics\nProgress + Modality Stats]
    DB --> Profile[/profile\nLearner Preferences]
    DB --> Onboarding[/onboarding\nModality Setup Flow]
    DB --> Search[/search\nGlobal Document Search]
```

### Data Flow: Learn Page (SSE Streaming)

```mermaid
sequenceDiagram
    participant FE as /dashboard/learn
    participant API as FastAPI SSE
    participant Agent as note_composer_agent
    participant RAG as rag_service

    FE->>API: POST /learning/lesson (topic)
    API->>RAG: Retrieve context chunks
    RAG-->>Agent: High-fidelity chunks
    Agent-->>API: Structured sections (text/diagram/image)
    API-->>FE: SSE token stream
    FE->>FE: Render sections live\n(text, Mermaid diagrams, cited refs)
```

---

## 7. Backend Infrastructure & Deployment

**What it does:** Stateless FastAPI backend deployable to Vercel or AWS Lambda — no local ML models, all state in Supabase.

### Contains

| File | Role |
|------|------|
| `main.py` | FastAPI app init — CORS, router registration, `/health` endpoint |
| `core/config.py` | Pydantic Settings — Gemini, Supabase, LiveKit, HF embedding service, Brave API |
| `core/auth.py` | JWT validation and Supabase token → user ID extraction |
| `core/prompts.py` | Shared LLM system prompts across the platform |
| `db/database.py` | SQLAlchemy session management + Supabase connection |
| `models/db_models.py` | ORM models: Document (768-dim pgvector), User, QuizSession, QuizAttempt |
| `services/llm_service.py` | Gemini API wrapper — streaming, JSON parsing, multi-turn history |
| `Dockerfile` | Container image for FastAPI + uvicorn |
| `supabase_migration.sql` / `_v2.sql` | Database schema + pgvector extension setup |

### Infrastructure Stack

```mermaid
flowchart LR
    subgraph Frontend
        Next[Next.js 15\nVercel Edge]
        Tailwind[TailwindCSS]
        Mermaid[Mermaid.js]
    end

    subgraph Backend
        FAPI[FastAPI\nuvicorn]
        LangG[LangGraph\nStateGraph]
        Gemini[Gemini LLM\ncloud API]
    end

    subgraph Data
        SB[(Supabase\nPostgreSQL)]
        PGV[pgvector\n768-dim]
        SBAuth[Supabase Auth\nJWT]
    end

    subgraph External
        HF[HuggingFace Space\nBAAI/bge-base-en-v1.5]
        LK[LiveKit\nWebRTC]
        DDG[DuckDuckGo\nBrave Search]
    end

    Next -- REST/SSE --> FAPI
    Next -- WebRTC --> LK
    FAPI --> LangG
    FAPI --> SB
    FAPI --> Gemini
    FAPI --> HF
    LangG --> DDG
```

### Stateless Scaling Model

```mermaid
flowchart LR
    LB[Load Balancer] --> I1[FastAPI Instance 1]
    LB --> I2[FastAPI Instance 2]
    LB --> I3[FastAPI Instance N]

    I1 & I2 & I3 --> SB[(Supabase\nAll State Stored Here)]
    I1 & I2 & I3 --> HF[HF Embedding Space]
    I1 & I2 & I3 --> Gemini[Gemini API]
```

> All conversation history, document states, learner profiles, and vector embeddings live in Supabase. FastAPI instances carry zero local state, enabling seamless horizontal scaling.

---

## Full End-to-End Request Flow

```mermaid
sequenceDiagram
    participant U as Learner
    participant FE as Next.js
    participant API as FastAPI
    participant Router as Intent Router
    participant RAG as RAG Pipeline
    participant LLM as Gemini
    participant DB as Supabase

    U->>FE: Sends message / voice input
    FE->>API: POST /agent/message (JWT auth)
    API->>Router: Classify intent (9 intents)
    Router->>RAG: Retrieve relevant chunks
    RAG->>DB: Hybrid vector + keyword search
    DB-->>RAG: Top-N chunks
    RAG->>RAG: RRF merge + rerank (≥0.55)
    RAG-->>LLM: Chunks + system prompt
    LLM-->>API: Streaming response tokens
    API-->>FE: SSE stream
    FE-->>U: Live-rendered response\n(text, diagrams, citations)
    API->>DB: Persist session + update learner profile
```
