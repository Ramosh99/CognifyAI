from typing import Dict, List, Optional

from app.services.llm_service import llm_service


def analyze_misconception(
    *,
    message: str,
    wrong_answer: Optional[str],
    correct_answer: Optional[str],
    context_chunks: List[str],
) -> Dict[str, object]:
    if not wrong_answer or not correct_answer:
        return {
            "response": "Send the question, your wrong answer, and the correct answer so I can analyze the misconception.",
            "quiz": None,
            "feedback": None,
            "action": None,
        }

    feedback = llm_service.analyze_misconception(
        context_chunks=context_chunks,
        question=message,
        wrong_answer=wrong_answer,
        correct_answer=correct_answer,
    )
    return {
        "response": feedback,
        "quiz": None,
        "feedback": feedback,
        "action": {
            "tool": "misconception_agent",
            "input": "answer_pair",
            "output": "feedback",
        },
    }
