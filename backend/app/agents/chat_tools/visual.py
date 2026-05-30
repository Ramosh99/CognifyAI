from typing import Dict, List

from app.api.endpoints.visual import _parse_diagram
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
        raw_diagram = llm_service.generate_diagram_from_selection(message)
        diagram_plan = llm_service.parse_json_response(raw_diagram)
        diagram = _parse_diagram(diagram_plan, message[:25])
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
