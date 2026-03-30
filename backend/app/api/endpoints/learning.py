from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

from app.core.auth import get_current_user_id
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/learning", tags=["Learning & Analytics"])

# ------------------------------------------------------------------ #
# Request / Response models
# ------------------------------------------------------------------ #

class QuizGenerateRequest(BaseModel):
    topic: str
    learner_type: str = "Textual"  # e.g., Visual, Textual, Practical
    question_count: int = 3

class QuizGenerateResponse(BaseModel):
    topic: str
    learner_type: str
    questions: List[Dict[str, Any]]

class AnalyzeAnswerRequest(BaseModel):
    question: str
    wrong_answer: str
    correct_answer: str
    topic: str

class AnalyzeAnswerResponse(BaseModel):
    feedback: str

# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #

@router.post("/generate-quiz", response_model=QuizGenerateResponse)
def generate_quiz(
    body: QuizGenerateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generates a Concept-Aware MCQ quiz based on the requested topic.
    1. Retrieves top-10 chunks from the user's own documents about the topic.
    2. Passes the chunks to the LLM to generate the quiz JSON.
    """
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required.")

    # Retrieve context — only this user's documents
    rag_results = rag_service.retrieve(
        query=body.topic,
        user_id=user_id,
        top_k=10,
    )

    if not rag_results:
        raise HTTPException(
            status_code=404,
            detail=f"No documents found for topic '{body.topic}'. Please upload your study materials first.",
        )

    context_chunks = [res["text"] for res in rag_results]

    try:
        questions_json = llm_service.generate_quiz(
            context_chunks=context_chunks,
            topic=body.topic,
            learner_type=body.learner_type,
            count=body.question_count,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {e}")

    return QuizGenerateResponse(
        topic=body.topic,
        learner_type=body.learner_type,
        questions=questions_json,
    )


@router.post("/analyze-answer", response_model=AnalyzeAnswerResponse)
def analyze_answer(
    body: AnalyzeAnswerRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Takes a user's wrong answer and explains the fundamental misconception
    based on the Ground Truth in the user's own uploaded documents.
    """
    rag_results = rag_service.retrieve(
        query=f"{body.question} {body.topic}",
        user_id=user_id,
        top_k=5,
    )

    context_chunks = [res["text"] for res in rag_results]

    try:
        feedback = llm_service.analyze_misconception(
            context_chunks=context_chunks,
            question=body.question,
            wrong_answer=body.wrong_answer,
            correct_answer=body.correct_answer,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze answer: {e}")

    return AnalyzeAnswerResponse(feedback=feedback)
