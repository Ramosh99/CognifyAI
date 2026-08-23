import os
from typing import List, Dict, Optional
import requests as _requests
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from app.core.auth import get_current_user_id
from app.core.config import settings
from app.services.llm_service import llm_service
from livekit import api

router = APIRouter(prefix="/audio", tags=["Auditory & LiveKit Voice"])

_AUDITORY_SYSTEM = (
    "You are CognifyAI's Auditory Tutor. The student is listening — they cannot read your reply. "
    "Keep every response SHORT (2-4 sentences max), conversational, and spoken-word friendly. "
    "No bullet points, no markdown, no lists. Use natural spoken English. "
    "Be warm, clear, and engaging — like a brilliant tutor speaking out loud."
)


class QueryRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None


@router.post("/query")
def fast_auditory_query(
    body: QueryRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Fast, conversational LLM response via Gemini (no RAG, no agent overhead).
    Designed for real-time auditory tutor — answers are short and spoken-word friendly.
    """
    try:
        answer = llm_service._call_llm(
            system_prompt=_AUDITORY_SYSTEM,
            user_prompt=body.message.strip(),
            temperature=0.6,
            max_tokens=200,
            history=body.history,
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {e}")


@router.post("/query/stream")
def fast_auditory_query_stream(
    body: QueryRequest,
    user_id: str = Depends(get_current_user_id),
):
    def event_generator():
        try:
            stream = llm_service.stream_auditory_query(
                system_prompt=_AUDITORY_SYSTEM,
                message=body.message.strip(),
                history=body.history,
            )
            for token in stream:
                data = json.dumps({"text": token})
                yield f"data: {data}\n\n"
            yield "event: done\ndata: {}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ─── LiveKit room token ───────────────────────────────────────────────────────

@router.get("/token")
def get_livekit_token(
    room: str = Query(default="cognify-auditory-room"),
    user_id: str = Depends(get_current_user_id),
):
    """
    Generates a LiveKit WebRTC room access token for Auditory Voice mode.
    Requires LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL in backend environment.
    """
    url = settings.LIVEKIT_URL or "wss://demo.livekit.cloud"
    api_key = settings.LIVEKIT_API_KEY
    api_secret = settings.LIVEKIT_API_SECRET

    if not api_key or not api_secret:
        return {
            "configured": False,
            "server_url": url,
            "room": room,
            "participant_name": f"Learner-{user_id[:6]}",
            "token": None,
            "message": "LiveKit credentials not configured in backend .env.",
        }

    try:
        token = (
            api.AccessToken(api_key, api_secret)
            .with_identity(user_id)
            .with_name(f"Learner-{user_id[:6]}")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room,
                    can_publish=True,
                    can_subscribe=True,
                )
            )
        )
        return {
            "configured": True,
            "server_url": url,
            "room": room,
            "participant_name": f"Learner-{user_id[:6]}",
            "token": token.to_jwt(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate LiveKit token: {e}")
