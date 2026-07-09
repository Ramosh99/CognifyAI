import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.core.auth import get_current_user_id
from app.services.agent_service import agent_service


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
    blocks: List[Dict[str, Any]] = []
    intent: str = "normal"
    actions: List[Dict[str, Any]] = []


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

    try:
        result = agent_service.run(
            message=body.message,
            user_id=user_id,
            history=history,
            topic=body.topic,
            top_k=body.top_k,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}") from e

    return ChatResponse(
        response=result.get("response", ""),
        sources=[ChatSource(**source) for source in result.get("sources", [])],
        blocks=result.get("blocks", []),
        intent=result.get("intent", "normal"),
        actions=result.get("actions", []),
    )


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
            yield f"event: status\ndata: {json.dumps({'message': 'Thinking...'})}\n\n"
            result = agent_service.run(
                message=body.message,
                user_id=user_id,
                history=history,
                topic=body.topic,
                top_k=body.top_k,
            )

            sources = result.get("sources", [])
            yield f"event: intent\ndata: {json.dumps({'intent': result.get('intent', 'normal')})}\n\n"
            yield f"event: actions\ndata: {json.dumps(result.get('actions', []))}\n\n"
            yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
            for block in result.get("blocks", []):
                if block.get("type") == "text":
                    yield from _emit_tokens([block.get("text", "")])
                else:
                    yield f"event: block\ndata: {json.dumps(block)}\n\n"
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
