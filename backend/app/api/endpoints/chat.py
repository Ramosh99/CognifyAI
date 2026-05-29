import json
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.core.auth import get_current_user_id
from app.services.agent_service import agent_service
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service


router = APIRouter(prefix="/chat", tags=["Chat"])


class ChatMessage(BaseModel):
    role: str
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


def _history(body: ChatRequest) -> List[dict]:
    return [{"role": m.role, "content": m.content} for m in (body.history or [])]


def _emit_tokens(chunks):
    for chunk in chunks:
        parts = chunk.split(" ")
        for index, part in enumerate(parts):
            token = part if index == len(parts) - 1 else f"{part} "
            if not token:
                continue
            yield f"event: token\ndata: {json.dumps({'text': token})}\n\n"
            time.sleep(0.015)


@router.post("/message", response_model=ChatResponse)
def chat_message(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message must not be empty.")

    history = _history(body)

    if agent_service.is_normal_message(body.message, body.topic):
        try:
            reply = llm_service.general_chat(message=body.message, history=history)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM error: {e}") from e
        return ChatResponse(response=reply, sources=[])

    rag_results = rag_service.retrieve(
        query=body.message,
        user_id=user_id,
        top_k=body.top_k,
        filter_topic=body.topic or None,
    )
    context_chunks = [r["text"] for r in rag_results]

    try:
        reply = llm_service.chat(
            context_chunks=context_chunks,
            message=body.message,
            history=history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}") from e

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


@router.post("/message/stream")
def chat_message_stream(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message must not be empty.")

    history = _history(body)

    def event_stream():
        try:
            if agent_service.is_normal_message(body.message, body.topic):
                yield f"event: status\ndata: {json.dumps({'message': 'Thinking...'})}\n\n"
                yield f"event: sources\ndata: {json.dumps([])}\n\n"
                yield from _emit_tokens(
                    llm_service.stream_general_chat(
                        message=body.message,
                        history=history,
                    )
                )
                yield "event: done\ndata: {}\n\n"
                return

            yield f"event: status\ndata: {json.dumps({'message': 'Searching your documents...'})}\n\n"

            rag_results = rag_service.retrieve(
                query=body.message,
                user_id=user_id,
                top_k=body.top_k,
                filter_topic=body.topic or None,
            )
            context_chunks = [r["text"] for r in rag_results]
            sources = [
                ChatSource(
                    text=r["text"],
                    score=r["score"],
                    topic=r.get("topic"),
                    source=r.get("source"),
                ).model_dump()
                for r in rag_results
            ]

            yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
            yield f"event: status\ndata: {json.dumps({'message': 'Generating answer...'})}\n\n"

            yield from _emit_tokens(
                llm_service.stream_chat(
                    context_chunks=context_chunks,
                    message=body.message,
                    history=history,
                )
            )
            yield "event: done\ndata: {}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
