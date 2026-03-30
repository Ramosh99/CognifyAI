"""
Documents API endpoints
-----------------------
Handles document ingestion (upload + ingest into vector DB)
and semantic search (retrieve relevant chunks for a query).

All operations are scoped to the authenticated user — users can only
ingest and search their own documents.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
import io

from app.core.auth import get_current_user_id
from app.services.rag_service import rag_service

router = APIRouter(prefix="/documents", tags=["Documents"])


# ------------------------------------------------------------------ #
# Request / Response models
# ------------------------------------------------------------------ #

class IngestTextRequest(BaseModel):
    text: str
    topic: Optional[str] = None
    source: Optional[str] = None


class IngestResponse(BaseModel):
    message: str
    chunks_stored: int


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    filter_topic: Optional[str] = None


class SearchResult(BaseModel):
    text: str
    score: float


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]


# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #

@router.post("/ingest/text", response_model=IngestResponse, status_code=status.HTTP_200_OK)
def ingest_text(
    body: IngestTextRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Ingest raw text directly (useful for pasting notes or lecture content).
    Data is stored under the authenticated user's account only.
    """
    metadata = {}
    if body.topic:
        metadata["topic"] = body.topic
    if body.source:
        metadata["source"] = body.source

    count = rag_service.ingest(body.text, user_id=user_id, metadata=metadata)
    return IngestResponse(message="Text ingested successfully.", chunks_stored=count)


@router.post("/ingest/file", response_model=IngestResponse, status_code=status.HTTP_200_OK)
async def ingest_file(
    file: UploadFile = File(...),
    topic: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Upload a plain text (.txt) or PDF file to be chunked and embedded.
    Data is stored under the authenticated user's account only.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    content = await file.read()

    if file.filename.endswith(".txt"):
        text = content.decode("utf-8", errors="ignore")
    elif file.filename.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")
    else:
        raise HTTPException(status_code=415, detail="Only .txt and .pdf files are supported.")

    metadata = {"source": file.filename}
    if topic:
        metadata["topic"] = topic

    count = rag_service.ingest(text, user_id=user_id, metadata=metadata)
    return IngestResponse(message=f"File '{file.filename}' ingested successfully.", chunks_stored=count)


@router.post("/search", response_model=SearchResponse)
def search_documents(
    body: SearchRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Semantic search: returns the top-k most relevant document chunks for a query.
    Only searches the authenticated user's own documents.
    """
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    raw_results = rag_service.retrieve(
        query=body.query,
        user_id=user_id,
        top_k=body.top_k,
        filter_topic=body.filter_topic,
    )

    results = [SearchResult(text=r["text"], score=r["score"]) for r in raw_results]
    return SearchResponse(query=body.query, results=results)
