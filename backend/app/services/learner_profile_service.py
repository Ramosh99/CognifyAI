"""
Learner Profile Service
-----------------------
Manages the dynamic learner model that drives adaptive content delivery.

The model is a JSON object stored in Supabase with 7 continuous fields.
After every quiz/lesson session it is updated using an exponential moving
average (EMA) so that no single session dominates the long-run profile.

Update formula (per modality dimension):
    new_pref = old_pref * (1 - α) + session_signal * α
    α = 0.30  (new session contributes 30% weight)

session_signal for a modality is:
    signal = score_ratio * speed_ratio   (both clamped to [0, 1])
where:
    score_ratio = quiz_score / 1.0
    speed_ratio = min(baseline_ms, time_ms) / max(baseline_ms, time_ms)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from supabase import create_client, Client
from app.core.config import settings


ALPHA = 0.30          # EMA learning rate — each new session = 30% weight
BASELINE_MS = 30_000  # 30 s reference response time for pace calculation
MIN_SESSIONS_FOR_FAST_PACE = 3


@dataclass
class LearnerProfile:
    user_id: str
    visual_pref: float = 0.5
    text_pref: float = 0.5
    example_pref: float = 0.5
    analogy_pref: float = 0.5
    auditory_pref: float = 0.5   # spoken/conversational content preference
    code_pref: float = 0.5       # code/pseudocode content preference
    current_skill: float = 0.3
    preferred_diff: float = 0.5
    needs_repetition: float = 0.5
    learning_pace: str = "medium"   # slow | medium | fast
    onboarding_done: bool = False
    total_sessions: int = 0
    last_topic: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "visual_pref": round(self.visual_pref, 4),
            "text_pref": round(self.text_pref, 4),
            "example_pref": round(self.example_pref, 4),
            "analogy_pref": round(self.analogy_pref, 4),
            "auditory_pref": round(self.auditory_pref, 4),
            "code_pref": round(self.code_pref, 4),
            "current_skill": round(self.current_skill, 4),
            "preferred_diff": round(self.preferred_diff, 4),
            "needs_repetition": round(self.needs_repetition, 4),
            "learning_pace": self.learning_pace,
            "onboarding_done": self.onboarding_done,
            "total_sessions": self.total_sessions,
            "last_topic": self.last_topic,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def dominant_modality(self) -> str:
        prefs = {
            "visual": self.visual_pref,
            "text": self.text_pref,
            "example": self.example_pref,
            "analogy": self.analogy_pref,
            "auditory": self.auditory_pref,
            "code": self.code_pref,
        }
        return max(prefs, key=prefs.get)


@dataclass
class SessionResult:
    """Outcome signals captured after one adaptive lesson+quiz session."""
    dominant_modality: str       # which modality was primarily used
    quiz_score: float            # 0.0–1.0 (fraction of questions correct)
    avg_response_ms: int         # average ms to answer
    total_attempts: int = 0
    correct_attempts: int = 0
    # Per-modality signals if we want fine-grained tracking
    modality_scores: Dict[str, float] = field(default_factory=dict)


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _get_supabase() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in your .env file.")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


class LearnerProfileService:
    """CRUD + update logic for the dynamic learner model."""

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_or_create(self, user_id: str) -> LearnerProfile:
        """
        Fetch the learner profile for the given user, or create a default one.
        Uses .limit(1).execute() instead of .maybe_single() for compatibility
        with all supabase-py versions.
        """
        client = _get_supabase()
        try:
            resp = (
                client.table("learner_profiles")
                .select("*")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            rows = resp.data if resp and resp.data else []
            if rows:
                return self._row_to_profile(rows[0])
        except Exception as e:
            # Table may not exist yet — return default and let _save create the row
            print(f"[LearnerProfile] get query failed: {e}")

        # Create default profile
        default = LearnerProfile(user_id=user_id)
        try:
            client.table("learner_profiles").insert(default.to_dict()).execute()
        except Exception as e:
            print(f"[LearnerProfile] insert failed: {e}")
        return default

    # ------------------------------------------------------------------
    # Write — onboarding
    # ------------------------------------------------------------------

    def apply_diagnostic_signals(
        self,
        user_id: str,
        signals: Dict[str, Any],
    ) -> LearnerProfile:
        """
        Called after the onboarding diagnostic assessment.
        `signals` is a dict of modality → {"score": 0.8, "avg_ms": 18000}.
        Overwrites the profile using these bootstrap values directly (not EMA)
        because this is the first observation.
        """
        profile = self.get_or_create(user_id)

        def _signal_to_pref(mod: str) -> float:
            s = signals.get(mod, {})
            score = _clamp(float(s.get("score", 0.5)))
            avg_ms = float(s.get("avg_ms", BASELINE_MS))
            speed = _clamp(BASELINE_MS / max(avg_ms, 1000))
            return _clamp(score * 0.6 + speed * 0.4)

        profile.visual_pref = _signal_to_pref("visual")
        profile.text_pref = _signal_to_pref("text")
        profile.example_pref = _signal_to_pref("example")
        profile.analogy_pref = _signal_to_pref("analogy")
        profile.auditory_pref = _signal_to_pref("auditory")
        profile.code_pref = _signal_to_pref("code")

        # Bootstrap skill from diagnostic average score
        all_scores = [
            float(v.get("score", 0.5))
            for v in signals.values()
            if isinstance(v, dict)
        ]
        if all_scores:
            profile.current_skill = _clamp(sum(all_scores) / len(all_scores))

        profile.onboarding_done = True
        self._save(profile)
        return profile

    # ------------------------------------------------------------------
    # Write — live session update (the core adaptation loop)
    # ------------------------------------------------------------------

    def update_from_session(
        self,
        user_id: str,
        result: SessionResult,
    ) -> LearnerProfile:
        """
        EMA update of the learner profile after one lesson+quiz session.

        Signal model:
          - If the user performed well AND was fast → reinforce that modality.
          - If score was low OR very slow → slightly decrease that modality pref.
          - Overall skill updates toward latest observed score.
        """
        profile = self.get_or_create(user_id)

        score = _clamp(result.quiz_score)
        speed = _clamp(BASELINE_MS / max(result.avg_response_ms, 1000))
        # Combined signal: 60% accuracy, 40% speed
        session_signal = _clamp(score * 0.6 + speed * 0.4)

        # Update the modality that was primarily used
        mod = result.dominant_modality
        if mod == "visual":
            profile.visual_pref = _clamp(profile.visual_pref * (1 - ALPHA) + session_signal * ALPHA)
        elif mod == "text":
            profile.text_pref = _clamp(profile.text_pref * (1 - ALPHA) + session_signal * ALPHA)
        elif mod == "example":
            profile.example_pref = _clamp(profile.example_pref * (1 - ALPHA) + session_signal * ALPHA)
        elif mod == "analogy":
            profile.analogy_pref = _clamp(profile.analogy_pref * (1 - ALPHA) + session_signal * ALPHA)
        elif mod == "auditory":
            profile.auditory_pref = _clamp(profile.auditory_pref * (1 - ALPHA) + session_signal * ALPHA)
        elif mod == "code":
            profile.code_pref = _clamp(profile.code_pref * (1 - ALPHA) + session_signal * ALPHA)

        # Fine-grained per-modality updates if available
        for m, m_score in result.modality_scores.items():
            m_signal = _clamp(float(m_score))
            if m == "visual":
                profile.visual_pref = _clamp(profile.visual_pref * (1 - ALPHA * 0.5) + m_signal * ALPHA * 0.5)
            elif m == "text":
                profile.text_pref = _clamp(profile.text_pref * (1 - ALPHA * 0.5) + m_signal * ALPHA * 0.5)
            elif m == "example":
                profile.example_pref = _clamp(profile.example_pref * (1 - ALPHA * 0.5) + m_signal * ALPHA * 0.5)
            elif m == "analogy":
                profile.analogy_pref = _clamp(profile.analogy_pref * (1 - ALPHA * 0.5) + m_signal * ALPHA * 0.5)
            elif m == "auditory":
                profile.auditory_pref = _clamp(profile.auditory_pref * (1 - ALPHA * 0.5) + m_signal * ALPHA * 0.5)
            elif m == "code":
                profile.code_pref = _clamp(profile.code_pref * (1 - ALPHA * 0.5) + m_signal * ALPHA * 0.5)


        # Skill update
        profile.current_skill = _clamp(profile.current_skill * (1 - ALPHA) + score * ALPHA)

        # Difficulty auto-adjust: if scoring > 80% consistently, nudge difficulty up
        if score > 0.80:
            profile.preferred_diff = _clamp(profile.preferred_diff + 0.05)
        elif score < 0.45:
            profile.preferred_diff = _clamp(profile.preferred_diff - 0.05)

        # Repetition need: low scores → more repetition needed
        repetition_signal = 1.0 - score
        profile.needs_repetition = _clamp(
            profile.needs_repetition * (1 - ALPHA) + repetition_signal * ALPHA
        )

        # Pace: if avg_ms < 15 s and score > 0.7 for ≥ MIN_SESSIONS sessions → fast
        profile.total_sessions += 1
        if profile.total_sessions >= MIN_SESSIONS_FOR_FAST_PACE:
            if result.avg_response_ms < 15_000 and score > 0.70:
                profile.learning_pace = "fast"
            elif result.avg_response_ms > 60_000 or score < 0.40:
                profile.learning_pace = "slow"
            else:
                profile.learning_pace = "medium"

        self._save(profile)
        return profile

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _save(self, profile: LearnerProfile) -> None:
        try:
            client = _get_supabase()
            client.table("learner_profiles").upsert(
                profile.to_dict(),
                on_conflict="user_id",
            ).execute()
        except Exception as e:
            print(f"[LearnerProfile] save failed: {e}")

    @staticmethod
    def _row_to_profile(row: Dict[str, Any]) -> LearnerProfile:
        return LearnerProfile(
            user_id=row["user_id"],
            visual_pref=float(row.get("visual_pref", 0.5)),
            text_pref=float(row.get("text_pref", 0.5)),
            example_pref=float(row.get("example_pref", 0.5)),
            analogy_pref=float(row.get("analogy_pref", 0.5)),
            auditory_pref=float(row.get("auditory_pref", 0.5)),
            code_pref=float(row.get("code_pref", 0.5)),
            current_skill=float(row.get("current_skill", 0.3)),
            preferred_diff=float(row.get("preferred_diff", 0.5)),
            needs_repetition=float(row.get("needs_repetition", 0.5)),
            learning_pace=row.get("learning_pace", "medium"),
            onboarding_done=bool(row.get("onboarding_done", False)),
            total_sessions=int(row.get("total_sessions", 0)),
            last_topic=row.get("last_topic"),
        )


# Singleton
learner_profile_service = LearnerProfileService()
