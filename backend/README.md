---
title: CognifyAI Backend
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: FastAPI backend for CognifyAI
---

# CognifyAI API

FastAPI backend powering the CognifyAI adaptive learning platform.

## Embedding Service

For the two-Space deployment, deploy `embedding-space/cognify-embedding/` first,
then set these secrets on this backend Space:

```env
EMBEDDING_SERVICE_URL=https://your-embedding-space.hf.space
EMBEDDING_SERVICE_TOKEN=the-same-token-used-by-the-embedding-space
```

The backend requires `EMBEDDING_SERVICE_URL` and calls the remote embedding
Space for all embedding work. It does not install or load `sentence-transformers`,
`transformers`, or `torch`.

## Endpoints

- `POST /api/v1/documents/ingest/file` - Upload PDF/TXT documents
- `POST /api/v1/documents/ingest/text` - Ingest raw text
- `POST /api/v1/documents/search` - Semantic search
- `POST /api/v1/chat/message` - RAG-grounded chatbot
- `POST /api/v1/learning/generate-quiz` - Adaptive MCQ quiz
- `POST /api/v1/learning/analyze-answer` - Misconception analysis
- `POST /api/v1/visual/explain/stream` - Streaming visual article
- `POST /api/v1/visual/diagram` - On-demand diagram generation

## Docs

Visit `/docs` for the full Swagger UI.
