from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.services.agent_service import agent_service


router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentChatMessage(BaseModel):
    role: str
    content: str


class AgentMessageRequest(BaseModel):
    message: str
    history: Optional[List[AgentChatMessage]] = []
    topic: Optional[str] = None
    learner_type: str = "Textual"
    top_k: int = 6
    question_count: int = 3
    wrong_answer: Optional[str] = None
    correct_answer: Optional[str] = None


class AgentAction(BaseModel):
    tool: str
    input: Any
    output: Any


class AgentSource(BaseModel):
    text: str
    score: float
    topic: Optional[str] = None
    source: Optional[str] = None


class AgentMessageResponse(BaseModel):
    intent: str
    response: str
    blocks: List[Dict[str, Any]] = []
    actions: List[AgentAction]
    sources: List[AgentSource]
    quiz: Optional[List[Dict[str, Any]]] = None
    feedback: Optional[str] = None


@router.post("/message", response_model=AgentMessageResponse)
def agent_message(
    body: AgentMessageRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message must not be empty.")

    history = [
        {"role": message.role, "content": message.content}
        for message in (body.history or [])
    ]

    try:
        return agent_service.run(
            message=body.message,
            user_id=user_id,
            history=history,
            topic=body.topic,
            learner_type=body.learner_type,
            top_k=body.top_k,
            question_count=body.question_count,
            wrong_answer=body.wrong_answer,
            correct_answer=body.correct_answer,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}") from exc
