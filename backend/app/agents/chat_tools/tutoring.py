from typing import Dict, List

from app.services.llm_service import llm_service


def answer_study_question(
    *,
    message: str,
    history: List[Dict[str, str]],
    context_chunks: List[str],
) -> Dict[str, object]:
    if context_chunks:
        response = llm_service.chat(
            context_chunks=context_chunks,
            message=message,
            history=history,
        )
        tool = "rag_tutor"
    else:
        response = llm_service.general_study_chat(
            message=message,
            history=history,
        )
        tool = "general_tutor"

    return {
        "response": response,
        "quiz": None,
        "feedback": None,
        "action": {"tool": tool, "input": message, "output": "response"},
    }
