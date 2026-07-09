from typing import Dict, List

from app.agents.visual_tools import build_diagram
from app.services.llm_service import llm_service


def answer_visual_question(
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
    else:
        response = llm_service.general_study_chat(
            message=message,
            history=history,
        )

    blocks = [{"type": "text", "text": response}]
    try:
        diagram = build_diagram(message)
        blocks.append({"type": "diagram", "diagram": diagram.model_dump()})
    except Exception:
        pass

    return {
        "response": (
            f"{response}\n\nI can also create a diagram from selected text with "
            "`/api/v1/visual/diagram`."
        ),
        "blocks": blocks,
        "quiz": None,
        "feedback": None,
        "action": {
            "tool": "visual_agent",
            "input": message,
            "output": "visual_response",
        },
    }
