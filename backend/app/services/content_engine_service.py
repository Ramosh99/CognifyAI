"""
Content Engine Service
----------------------
Takes a lesson plan (from LessonPlannerService) + RAG context and produces
a fully rendered multimodal lesson payload.

For each section in the plan it calls the right LLM method:
  - "text"    → generate_text_explanation()
  - "diagram" → generate_mermaid_diagram()
  - "example" → generate_lesson_example()
  - "analogy" → generate_lesson_analogy()

Then generates MCQs calibrated to the learner's difficulty setting.

Returns a structured dict that the frontend can render directly.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

import re
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service
from app.agents.quiz_tools import normalize_quiz
from app.core import prompts


def clean_mermaid(raw: str, concept: str = "Concept") -> str:
    """Sanitize and format raw LLM string into valid Mermaid flowchart code."""
    if not raw:
        return f"graph TD;\n  A[{concept}] --> B[Overview]"
    cleaned = raw.strip()
    # Strip markdown code blocks
    cleaned = re.sub(r"^```(?:mermaid)?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):

        cleaned = cleaned[1:-1].strip()

    # Ensure it starts with valid directive
    valid_directives = ("graph", "flowchart", "sequencediagram", "classdiagram", "gantt", "pie", "mindmap")
    if not any(cleaned.lower().startswith(d) for d in valid_directives):
        cleaned = f"graph TD;\n  A[\"{concept}\"] --> B[\"{cleaned[:40].replace('\"', '\'')}\"]"
    return cleaned



class ContentEngineService:

    def generate_concepts_for_topic(self, topic: str) -> list[str]:
        """
        Given a user-supplied topic (e.g. "calculus", "machine learning"),
        ask the LLM to derive 3 focused sub-concepts suitable for diagnostics.
        Falls back to safe defaults if parsing fails.
        """
        try:
            raw = llm_service._call_llm(
                system_prompt=prompts.CONCEPT_GENERATOR_SYSTEM_PROMPT,
                user_prompt=prompts.get_concept_generator_prompt(topic),
                temperature=0.4,
                max_tokens=150,
            )
            parsed = llm_service.parse_json_response(raw)
            if isinstance(parsed, list) and all(isinstance(c, str) for c in parsed):
                return [c.strip() for c in parsed[:3] if c.strip()]
        except Exception as e:
            print(f"[ContentEngine] Concept generation failed: {e}")
        # Fallback: use the topic itself split into generic sub-concepts
        return [f"{topic} fundamentals", f"{topic} applications", f"{topic} common mistakes"]

    def generate_lesson(
        self,
        plan: Dict[str, Any],
        user_id: str,
        context_chunks: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Given a lesson plan dict (from LessonPlannerService) and optional
        pre-fetched RAG context, produce the full multimodal lesson.

        If context_chunks is None, retrieves fresh from RAG.
        """
        topic: str = plan["topic"]
        difficulty: float = plan.get("difficulty", 0.5)
        quiz_count: int = plan.get("quiz_count", 4)
        sections_plan: List[Dict] = plan.get("sections", [])

        # ── Fetch context if not already provided ──
        if context_chunks is None:
            rag_results = rag_service.retrieve(
                query=topic,
                user_id=user_id,
                top_k=12,
                apply_rerank=True,
                rerank_top_n=6,
            )
            context_chunks = [r["text"] for r in rag_results]

        combined_context = "\n\n---\n\n".join(context_chunks) if context_chunks else ""
        difficulty_label = self._difficulty_label(difficulty)

        # ── Generate each content section ──
        rendered_sections: List[Dict[str, Any]] = []
        for sec in sections_plan:
            mod = sec["type"]
            content_block = self._generate_section(
                modality=mod,
                topic=topic,
                context=combined_context,
                difficulty_label=difficulty_label,
            )
            rendered_sections.append({
                "id": str(uuid.uuid4())[:8],
                "type": mod,
                "label": sec.get("label", mod.title()),
                "weight": sec.get("weight", 0.33),
                **content_block,
            })

        # ── Generate quiz ──
        quiz_questions = self._generate_quiz(
            topic=topic,
            context=combined_context,
            count=quiz_count,
            difficulty_label=difficulty_label,
        )

        return {
            "topic": topic,
            "difficulty": difficulty,
            "difficulty_label": difficulty_label,
            "modality_mix": plan.get("modality_mix", {}),
            "sections": rendered_sections,
            "quiz": quiz_questions,
        }

    def generate_diagnostic_tasks(self, concept: str) -> Dict[str, Any]:
        """
        Generate 6 representations of the same concept for the onboarding
        diagnostic. Uses a single-pass JSON call to avoid API rate limits (429s).
        Representations: text, diagram, example, analogy, auditory, code
        """
        try:
            raw = llm_service._call_llm(
                system_prompt=prompts.BATCH_DIAGNOSTIC_SYSTEM_PROMPT,
                user_prompt=prompts.get_batch_diagnostic_prompt(concept),
                temperature=0.4,
                max_tokens=2200,
            )
            parsed = llm_service.parse_json_response(raw)

            if isinstance(parsed, dict):
                representations: Dict[str, Any] = {}
                for mod in ["text", "diagram", "example", "analogy", "auditory", "code"]:
                    mod_data = parsed.get(mod, {})
                    quiz_obj = {}
                    content_str = ""
                    mermaid_str = ""

                    if isinstance(mod_data, str):
                        content_str = mod_data
                    elif isinstance(mod_data, dict):
                        # Extract quiz
                        raw_quiz = mod_data.get("quiz")
                        norm_quiz_list = normalize_quiz([raw_quiz] if raw_quiz else [], concept, 1)
                        quiz_obj = norm_quiz_list[0] if norm_quiz_list else {}

                        # Extract content flexibly across different LLM key conventions
                        content_str = (
                            mod_data.get("content") or
                            mod_data.get("text") or
                            mod_data.get("explanation") or
                            mod_data.get("script") or
                            mod_data.get("example") or
                            mod_data.get("code") or
                            ""
                        )
                        mermaid_str = mod_data.get("mermaid") or mod_data.get("diagram") or ""

                    # Default fallback content if LLM didn't provide text
                    if mod == "diagram":
                        m_str = mermaid_str or (mod_data.get("content") if isinstance(mod_data, dict) else "")
                        mermaid_val = clean_mermaid(m_str, concept)
                        representations["diagram"] = {"mermaid": mermaid_val, "quiz": quiz_obj or normalize_quiz([], concept, 1)[0]}
                    else:

                        if not content_str:
                            fallbacks = {
                                "text": f"{concept.title()} involves fundamental principles and structures in this field.",
                                "example": f"For instance, {concept} is routinely applied in production environments to solve real-world challenges.",
                                "analogy": f"Think of {concept} like a central engine component coordinating system operations.",
                                "auditory": f"So when we talk about {concept}, think of it as the core logic driving the whole process smoothly.",
                                "code": f"# Demonstration of {concept}\ndef handle_{concept.lower().replace(' ', '_')}():\n    # Core logic goes here\n    pass",
                            }
                            content_str = fallbacks.get(mod, f"Explanation of {concept}")

                        representations[mod] = {"content": content_str, "quiz": quiz_obj or normalize_quiz([], concept, 1)[0]}

                if len(representations) == 6:
                    return {
                        "concept": concept,
                        "representations": representations,
                    }

        except Exception as e:
            print(f"[ContentEngine] Single-pass batch diagnostic failed: {e}. Falling back to fallback tasks.")

        # Fallback representation generator in case of LLM error
        return {
            "concept": concept,
            "representations": {
                "text": {"content": f"Core textual principles of {concept}.", "quiz": normalize_quiz([], concept, 1)[0]},
                "diagram": {"mermaid": f"graph TD;\n  Concept[{concept}] --> Detail[Core Logic]", "quiz": normalize_quiz([], concept, 1)[0]},
                "example": {"content": f"A real-world case study demonstrating {concept}.", "quiz": normalize_quiz([], concept, 1)[0]},
                "analogy": {"content": f"Think of {concept} like a well-regulated feedback system.", "quiz": normalize_quiz([], concept, 1)[0]},
                "auditory": {"content": f"Imagine explaining {concept} to a friend over coffee...", "quiz": normalize_quiz([], concept, 1)[0]},
                "code": {"content": f"# Implementation of {concept}\ndef process():\n    pass", "quiz": normalize_quiz([], concept, 1)[0]},
            }
        }


    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _generate_section(
        self,
        modality: str,
        topic: str,
        context: str,
        difficulty_label: str,
    ) -> Dict[str, Any]:
        if modality == "text":
            content = llm_service._call_llm(
                system_prompt=prompts.ADAPTIVE_TEXT_SYSTEM_PROMPT,
                user_prompt=prompts.get_adaptive_text_prompt(context, topic, difficulty_label),
                temperature=0.35, max_tokens=600,
            )
            return {"content": content}

        elif modality == "diagram":
            try:
                raw = llm_service.generate_diagram_from_selection(
                    text=f"{topic}\n\n{context[:500]}"
                )
            except Exception:
                raw = f"graph TD;\n  Topic[{topic}] --> Step1[Input Logic]\n  Step1 --> Step2[Core Algorithm]\n  Step2 --> Output[Result]"
            clean_diag = clean_mermaid(raw, topic)
            return {"diagram_json": clean_diag, "content": clean_diag}


        elif modality == "example":
            content = llm_service._call_llm(
                system_prompt=prompts.ADAPTIVE_EXAMPLE_SYSTEM_PROMPT,
                user_prompt=prompts.get_adaptive_example_prompt(context, topic, difficulty_label),
                temperature=0.4, max_tokens=400,
            )
            return {"content": content}

        elif modality == "analogy":
            content = llm_service._call_llm(
                system_prompt=prompts.ADAPTIVE_ANALOGY_SYSTEM_PROMPT,
                user_prompt=prompts.get_adaptive_analogy_prompt(topic, difficulty_label),
                temperature=0.5, max_tokens=300,
            )
            return {"content": content}

        elif modality == "auditory":
            content = llm_service._call_llm(
                system_prompt=prompts.ADAPTIVE_AUDITORY_SYSTEM_PROMPT,
                user_prompt=prompts.get_adaptive_auditory_prompt(topic, context, difficulty_label),
                temperature=0.45, max_tokens=350,
            )
            return {"content": content}

        elif modality == "code":
            content = llm_service._call_llm(
                system_prompt=prompts.ADAPTIVE_CODE_SYSTEM_PROMPT,
                user_prompt=prompts.get_adaptive_code_prompt(topic, context, difficulty_label),
                temperature=0.2, max_tokens=500,
            )
            return {"content": content}

        return {"content": ""}

    def _generate_quiz(
        self,
        topic: str,
        context: str,
        count: int,
        difficulty_label: str,
    ) -> List[Dict[str, Any]]:
        try:
            raw = llm_service._call_llm(
                system_prompt=prompts.ADAPTIVE_QUIZ_SYSTEM_PROMPT,
                user_prompt=prompts.get_adaptive_quiz_prompt(context, topic, count, difficulty_label),
                temperature=0.3,
                max_tokens=max(1800, count * 900),
            )
            parsed = llm_service.parse_json_response(raw)
            return normalize_quiz(parsed, topic, count)
        except Exception as e:
            print(f"[ContentEngine] Quiz generation error: {e}")
            return normalize_quiz([], topic, count)

    def _generate_single_question(self, topic: str, context: str) -> Dict[str, Any]:
        try:
            raw = llm_service._call_llm(
                system_prompt=prompts.QUIZ_GENERATION_SYSTEM_PROMPT,
                user_prompt=prompts.get_quiz_user_prompt(context[:500], topic, "Textual", 1),
                temperature=0.3,
                max_tokens=700,
            )
            parsed = llm_service.parse_json_response(raw)
            questions = normalize_quiz(parsed, topic, 1)
            return questions[0] if questions else {}
        except Exception:
            return {}

    @staticmethod
    def _difficulty_label(diff: float) -> str:
        if diff < 0.35:
            return "beginner"
        if diff < 0.65:
            return "intermediate"
        return "advanced"


# Singleton
content_engine_service = ContentEngineService()
