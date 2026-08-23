"""
Learning & Adaptive System API
--------------------------------
Endpoints:
  Legacy (unchanged):
    POST /learning/generate-quiz
    POST /learning/analyze-answer

  New — Adaptive Loop:
    GET  /learning/profile                → get learner profile
    POST /learning/onboarding/start       → begin diagnostic assessment
    POST /learning/onboarding/submit      → submit signals, finalize profile
    POST /learning/lesson/generate        → generate adaptive lesson for topic
    POST /learning/lesson/complete        → record session result, update profile
    GET  /learning/lesson/history         → list past sessions
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from app.core.auth import get_current_user_id
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service
from app.services.learner_profile_service import learner_profile_service, SessionResult
from app.services.lesson_planner_service import lesson_planner_service
from app.services.content_engine_service import content_engine_service

from supabase import create_client
from app.core.config import settings

router = APIRouter(prefix="/learning", tags=["Learning & Analytics"])


def _get_supabase():
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


# ================================================================
# Request / Response Models
# ================================================================

class QuizGenerateRequest(BaseModel):
    topic: str
    learner_type: str = "Textual"
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

# ── Profile ──
class LearnerProfileResponse(BaseModel):
    user_id: str
    visual_pref: float
    text_pref: float
    example_pref: float
    analogy_pref: float
    auditory_pref: float
    code_pref: float
    current_skill: float
    preferred_diff: float
    needs_repetition: float
    learning_pace: str
    onboarding_done: bool
    total_sessions: int
    last_topic: Optional[str]
    dominant_modality: str

# ── Onboarding ──
class OnboardingStartRequest(BaseModel):
    user_topic: str = Field(
        default="machine learning",
        description="The subject the user wants to study (e.g. 'calculus', 'machine learning')."
    )
    concepts: Optional[List[str]] = Field(
        default=None,
        description="Override: explicit concepts to use instead of auto-generating from user_topic."
    )

class DiagnosticSignal(BaseModel):
    score: float          # 0.0–1.0
    avg_ms: int           # average response time in ms

class OnboardingSubmitRequest(BaseModel):
    diagnostic_session_id: str
    signals: Dict[str, DiagnosticSignal]   # e.g. {"visual": {...}, "text": {...}}

# ── Lesson ──
class LessonGenerateRequest(BaseModel):
    topic: str

class LessonCompleteRequest(BaseModel):
    session_id: str
    topic: str
    dominant_modality: str          # which modality was primarily consumed
    quiz_score: float               # 0.0–1.0
    avg_response_ms: int
    total_attempts: int = 0
    correct_attempts: int = 0
    modality_scores: Dict[str, float] = Field(default_factory=dict)


# ================================================================
# Legacy Endpoints (unchanged)
# ================================================================

@router.post("/generate-quiz", response_model=QuizGenerateResponse)
def generate_quiz(
    body: QuizGenerateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generates concept-aware MCQs (legacy endpoint, still used by /dashboard/quiz)."""
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required.")
    question_count = min(max(body.question_count, 1), 10)

    rag_results = rag_service.retrieve(query=body.topic, user_id=user_id, top_k=10)
    context_chunks = [res["text"] for res in rag_results]

    try:
        if context_chunks:
            questions_json = llm_service.generate_quiz(
                context_chunks=context_chunks,
                topic=body.topic,
                learner_type=body.learner_type,
                count=question_count,
            )
        else:
            questions_json = llm_service.generate_general_quiz(
                topic=body.topic,
                learner_type=body.learner_type,
                count=question_count,
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
    """Analyses a wrong answer and explains the misconception."""
    rag_results = rag_service.retrieve(
        query=f"{body.question} {body.topic}", user_id=user_id, top_k=5
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


# ================================================================
# New — Learner Profile
# ================================================================

@router.get("/profile", response_model=LearnerProfileResponse)
def get_profile(user_id: str = Depends(get_current_user_id)):
    """Returns the current dynamic learner profile."""
    try:
        profile = learner_profile_service.get_or_create(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profile: {e}")

    return LearnerProfileResponse(
        **profile.to_dict(),
        dominant_modality=profile.dominant_modality(),
    )


# ================================================================
# New — Onboarding / Diagnostic Assessment
# ================================================================

@router.post("/onboarding/start")
def onboarding_start(
    body: OnboardingStartRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Step 1: Generate diagnostic concepts from the user's chosen topic,
    then return 6 multimodal representations per concept.
    """
    # ── Resolve concepts ──
    if body.concepts:
        concepts = body.concepts[:3]
    else:
        # LLM derives 3 sub-concepts from the user's chosen topic
        try:
            concepts = content_engine_service.generate_concepts_for_topic(body.user_topic)
        except Exception as e:
            concepts = [f"{body.user_topic} fundamentals",
                        f"{body.user_topic} applications",
                        f"{body.user_topic} common mistakes"]

    if not concepts:
        raise HTTPException(status_code=400, detail="Could not generate diagnostic concepts.")

    diagnostic_id = str(uuid.uuid4())
    tasks = []

    for concept in concepts:
        try:
            task = content_engine_service.generate_diagnostic_tasks(concept)
            tasks.append(task)
        except Exception as e:
            tasks.append({"concept": concept, "error": str(e), "representations": {}})

    # Persist the diagnostic session
    try:
        client = _get_supabase()
        client.table("diagnostic_sessions").insert({
            "id": diagnostic_id,
            "user_id": user_id,
            "topic": body.user_topic,
            "concepts": concepts,
        }).execute()
    except Exception:
        pass

    return {
        "diagnostic_session_id": diagnostic_id,
        "user_topic": body.user_topic,
        "concepts": concepts,
        "tasks": tasks,
    }


@router.post("/onboarding/submit")
def onboarding_submit(
    body: OnboardingSubmitRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Receives the modality-level performance signals from the diagnostic quiz.
    Computes the initial learner profile and marks onboarding as complete.
    """
    signals = {k: {"score": v.score, "avg_ms": v.avg_ms} for k, v in body.signals.items()}

    try:
        profile = learner_profile_service.apply_diagnostic_signals(user_id, signals)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute profile: {e}")

    # Mark diagnostic session complete
    try:
        client = _get_supabase()
        client.table("diagnostic_sessions").update({
            "signals": signals,
            "computed_profile": profile.to_dict(),
            "completed": True,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", body.diagnostic_session_id).execute()
    except Exception:
        pass

    return {
        "message": "Onboarding complete.",
        "profile": {**profile.to_dict(), "dominant_modality": profile.dominant_modality()},
    }


# ================================================================
# New — Adaptive Lesson
# ================================================================

@router.post("/lesson/generate")
def lesson_generate(
    body: LessonGenerateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generates a fully adaptive multimodal lesson for the given topic.
    Uses the learner's current profile to select modality mix and difficulty.
    """
    if not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required.")

    # 1. Get learner profile
    try:
        profile = learner_profile_service.get_or_create(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load profile: {e}")

    # 2. Build lesson plan
    plan = lesson_planner_service.build_plan(profile, body.topic)

    # 3. Retrieve RAG context once (shared across all sections)
    try:
        rag_results = rag_service.retrieve(
            query=body.topic,
            user_id=user_id,
            top_k=12,
            apply_rerank=True,
            rerank_top_n=6,
        )
        context_chunks = [r["text"] for r in rag_results]
    except Exception:
        context_chunks = []

    # 4. Generate multimodal lesson content
    try:
        lesson = content_engine_service.generate_lesson(
            plan=plan,
            user_id=user_id,
            context_chunks=context_chunks,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate lesson: {e}")

    # 5. Create learning session record
    session_id = str(uuid.uuid4())
    try:
        client = _get_supabase()
        client.table("learning_sessions").insert({
            "id": session_id,
            "user_id": user_id,
            "topic": body.topic,
            "modality_mix": plan["modality_mix"],
            "dominant_modality": profile.dominant_modality(),
        }).execute()
    except Exception:
        pass

    return {
        "session_id": session_id,
        "plan": plan,
        "lesson": lesson,
        "profile_snapshot": {
            "visual_pref": profile.visual_pref,
            "text_pref": profile.text_pref,
            "example_pref": profile.example_pref,
            "analogy_pref": profile.analogy_pref,
            "dominant_modality": profile.dominant_modality(),
            "current_skill": profile.current_skill,
            "learning_pace": profile.learning_pace,
        },
    }


@router.post("/lesson/complete")
def lesson_complete(
    body: LessonCompleteRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Records the session outcome and updates the learner profile via EMA.
    This is the adaptation step — the profile changes after every session.
    """
    result = SessionResult(
        dominant_modality=body.dominant_modality,
        quiz_score=body.quiz_score,
        avg_response_ms=body.avg_response_ms,
        total_attempts=body.total_attempts,
        correct_attempts=body.correct_attempts,
        modality_scores=body.modality_scores,
    )

    try:
        updated_profile = learner_profile_service.update_from_session(user_id, result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {e}")

    # Persist session outcome
    try:
        client = _get_supabase()
        client.table("learning_sessions").update({
            "quiz_score": body.quiz_score,
            "avg_response_ms": body.avg_response_ms,
            "total_attempts": body.total_attempts,
            "correct_attempts": body.correct_attempts,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", body.session_id).execute()

        # Update last_topic on profile
        client.table("learner_profiles").update({
            "last_topic": body.topic,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
    except Exception:
        pass

    return {
        "message": "Session recorded. Profile updated.",
        "updated_profile": {
            **updated_profile.to_dict(),
            "dominant_modality": updated_profile.dominant_modality(),
        },
        "adaptation": {
            "modality_reinforced": body.dominant_modality,
            "new_difficulty": updated_profile.preferred_diff,
            "new_skill": updated_profile.current_skill,
            "pace": updated_profile.learning_pace,
        },
    }


@router.get("/lesson/history")
def lesson_history(
    user_id: str = Depends(get_current_user_id),
    limit: int = 20,
):
    """Returns the user's past learning sessions (most recent first)."""
    try:
        client = _get_supabase()
        resp = (
            client.table("learning_sessions")
            .select("id,topic,quiz_score,avg_response_ms,dominant_modality,started_at,completed_at")
            .eq("user_id", user_id)
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"sessions": resp.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {e}")
