from typing import Dict, List

from app.services.llm_service import llm_service


def answer_normal_message(
    *,
    message: str,
    history: List[Dict[str, str]],
) -> Dict[str, object]:
    response = llm_service.general_chat(
        message=message,
        history=history,
    )
    return {
        "response": response,
        "sources": [],
        "quiz": None,
        "feedback": None,
        "action": {"tool": "direct_chat", "input": message, "output": "response"},
    }
