"""
Chat API endpoint
-----------------
RAG-grounded multi-turn chatbot. Retrieves relevant document chunks from
the vector DB (scoped to the authenticated user), then calls the LLM
with the context + conversation history.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict

from app.core.auth import get_current_user_id
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/chat", tags=["Chat"])


class ChatMessage(BaseModel):
    role: str    # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    topic: Optional[str] = None
    top_k: int = 6


class ChatSource(BaseModel):
    text: str
    score: float
    topic: Optional[str] = None
    source: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    sources: List[ChatSource]


@router.post("/message", response_model=ChatResponse)
def chat_message(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Send a message to the RAG chatbot.
    Returns an LLM response grounded in the authenticated user's own documents.
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message must not be empty.")

    # Retrieve context — only this user's documents
    rag_results = rag_service.retrieve(
        query=body.message,
        user_id=user_id,
        top_k=body.top_k,
        filter_topic=body.topic or None,
    )

    context_chunks = [r["text"] for r in rag_results]

    # Convert history to plain dicts for LLM service
    history = [{"role": m.role, "content": m.content} for m in (body.history or [])]

    try:
        reply = llm_service.chat(
            context_chunks=context_chunks,
            message=body.message,
            history=history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    sources = [
        ChatSource(
            text=r["text"],
            score=r["score"],
            topic=r.get("topic"),
            source=r.get("source"),
        )
        for r in rag_results
    ]

    return ChatResponse(response=reply, sources=sources)
