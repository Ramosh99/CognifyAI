---
title: CognifyAI Backend
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
---

# CognifyAI API

FastAPI backend powering the CognifyAI adaptive learning platform.

## Endpoints

- `POST /api/v1/documents/ingest/file` — Upload PDF/TXT documents
- `POST /api/v1/documents/ingest/text` — Ingest raw text
- `POST /api/v1/documents/search` — Semantic search
- `POST /api/v1/chat/message` — RAG-grounded chatbot
- `POST /api/v1/learning/generate-quiz` — Adaptive MCQ quiz
- `POST /api/v1/learning/analyze-answer` — Misconception analysis
- `POST /api/v1/visual/explain/stream` — Streaming visual article
- `POST /api/v1/visual/diagram` — On-demand diagram generation

## Docs

Visit `/docs` for the full Swagger UI.
