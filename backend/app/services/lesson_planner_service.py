"""
Lesson Planner Service
----------------------
Translates a LearnerProfile into a concrete lesson plan: which content
types to include, what order, at what difficulty, and how many quiz
questions to generate.

The modality mix is computed by normalising the learner's preference
scores against each other, so they always sum to 1.0.

Example output plan:
{
  "topic": "Neural Networks",
  "difficulty": 0.55,
  "sections": [
    {"type": "diagram",  "label": "Visual Overview",  "weight": 0.43},
    {"type": "text",     "label": "Core Explanation", "weight": 0.23},
    {"type": "example",  "label": "Real-World Case",  "weight": 0.34},
  ],
  "include_analogy": false,
  "quiz_count": 4,
  "modality_mix": {"visual": 0.43, "text": 0.23, "example": 0.34, "analogy": 0.0}
}
"""

from __future__ import annotations

from typing import Any, Dict, List

from app.services.learner_profile_service import LearnerProfile


# Analogy is only included when its preference exceeds this threshold
_ANALOGY_THRESHOLD = 0.60


class LessonPlannerService:
    """
    Derives a lesson plan from a LearnerProfile.
    Pure business logic — no I/O.
    """

    def build_plan(self, profile: LearnerProfile, topic: str) -> Dict[str, Any]:
        """
        Returns a lesson plan dict ready to be passed to ContentEngineService.
        """
        # --- Compute normalised modality mix ---
        raw = {
            "visual": profile.visual_pref,
            "text": profile.text_pref,
            "example": profile.example_pref,
            "auditory": profile.auditory_pref,
            "code": profile.code_pref,
        }
        # Only include analogy if preference is strong enough
        include_analogy = profile.analogy_pref >= _ANALOGY_THRESHOLD
        if include_analogy:
            raw["analogy"] = profile.analogy_pref

        total = sum(raw.values()) or 1.0
        mix = {k: round(v / total, 4) for k, v in raw.items()}

        # --- Build ordered section list (highest weight first) ---
        sections: List[Dict[str, Any]] = []
        for mod, weight in sorted(mix.items(), key=lambda x: -x[1]):
            sections.append({
                "type": mod,
                "label": self._section_label(mod, topic),
                "weight": weight,
            })

        # --- Quiz question count based on skill + pace ---
        quiz_count = self._quiz_count(profile)

        # --- Difficulty clamp ---
        difficulty = round(profile.preferred_diff, 3)

        return {
            "topic": topic,
            "difficulty": difficulty,
            "sections": sections,
            "include_analogy": include_analogy,
            "quiz_count": quiz_count,
            "modality_mix": mix,
            "learning_pace": profile.learning_pace,
            "needs_repetition": profile.needs_repetition > 0.60,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _section_label(modality: str, topic: str) -> str:
        labels = {
            "visual": f"Visual Overview — {topic}",
            "text": f"Core Explanation — {topic}",
            "example": f"Real-World Example — {topic}",
            "analogy": f"Analogy — {topic}",
            "auditory": f"Spoken Breakdown — {topic}",
            "code": f"Implementation & Logic — {topic}",
        }
        return labels.get(modality, topic)

    @staticmethod
    def _quiz_count(profile: LearnerProfile) -> int:
        """
        Faster learners / higher skill → fewer check questions (they need less repetition).
        Slower / lower skill → more questions for consolidation.
        """
        if profile.learning_pace == "fast" and profile.current_skill > 0.6:
            return 3
        if profile.learning_pace == "slow" or profile.needs_repetition > 0.65:
            return 6
        return 4


# Singleton
lesson_planner_service = LessonPlannerService()
