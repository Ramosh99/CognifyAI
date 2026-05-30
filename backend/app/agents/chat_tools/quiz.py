from typing import Dict, List

from app.services.llm_service import llm_service


def generate_quiz(
    *,
    topic: str,
    learner_type: str,
    question_count: int,
    context_chunks: List[str],
) -> Dict[str, object]:
    if context_chunks:
        questions = llm_service.generate_quiz(
            context_chunks=context_chunks,
            topic=topic,
            learner_type=learner_type,
            count=question_count,
        )
        response = f"I generated {len(questions)} grounded practice questions."
        tool = "quiz_agent"
    else:
        questions = llm_service.generate_general_quiz(
            topic=topic,
            learner_type=learner_type,
            count=question_count,
        )
        response = f"I generated {len(questions)} general practice questions."
        tool = "general_quiz_agent"

    return {
        "response": response,
        "blocks": [
            {"type": "text", "text": response},
            {"type": "quiz", "questions": questions},
        ],
        "quiz": questions,
        "feedback": None,
        "action": {
            "tool": tool,
            "input": {"topic": topic, "question_count": question_count},
            "output": {"questions": len(questions)},
        },
    }
