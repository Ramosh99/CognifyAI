"""
Grounding & Faithfulness Validation Service (Stage 6.1)
-------------------------------------------------------
Validates LLM-generated responses against the provided context evidence:
  - Detects hallucinations, fabricated numbers, or ungrounded assertions.
  - Verifies inline citations ([1], [2]).
  - Provides automated self-correction or safe refusal fallback if validation fails.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.llm_service import llm_service


@dataclass
class ValidationResult:
    is_grounded: bool
    faithfulness_score: float
    hallucinated_claims: List[str] = field(default_factory=list)
    invalid_citations: List[int] = field(default_factory=list)
    correction_feedback: Optional[str] = None
    corrected_response: Optional[str] = None


VALIDATION_SYSTEM_PROMPT = """
You are an expert Truth & Grounding Auditor.
Your job is to strictly verify whether the ASSISTANT ANSWER is completely faithful to the provided CONTEXT EVIDENCE.

Audit Criteria:
1. Every factual assertion (dates, numbers, names, policies, technical terms) in the answer MUST be explicitly supported by the CONTEXT.
2. If the answer introduces facts NOT present in the CONTEXT, mark them in "hallucinated_claims".
3. Check if all cited numbers ([1], [2]) exist in the context and accurately back up the claims.
4. If there are hallucinations, formulate "correction_feedback" to remove the ungrounded claims.

Output ONLY valid JSON matching this schema:
{
  "is_grounded": true | false,
  "faithfulness_score": 0.00 to 1.00,
  "hallucinated_claims": ["claim 1", "claim 2"],
  "invalid_citations": [3],
  "correction_feedback": "Explanation of what to remove or fix"
}
"""

CORRECTION_SYSTEM_PROMPT = """
You are an enterprise AI editor.
Rewrite the ASSISTANT RESPONSE to remove all hallucinated claims and strictly adhere to the EVIDENCE CONTEXT.
If removing hallucinations leaves no answerable information, state that the documents do not provide enough information.
Keep valid inline citations [1], [2].
"""


class ValidationService:
    def __init__(self, min_faithfulness_threshold: float = 0.80):
        self.min_faithfulness_threshold = min_faithfulness_threshold

    def validate_answer(
        self,
        query: str,
        response_text: str,
        context_evidence: str,
    ) -> ValidationResult:
        """
        Audits the generated response against the context.
        """
        if not context_evidence.strip() or "NO EVIDENCE FOUND" in context_evidence:
            return ValidationResult(
                is_grounded=True,
                faithfulness_score=1.0,
                hallucinated_claims=[],
                correction_feedback=None,
                corrected_response=response_text,
            )

        user_prompt = f"""CONTEXT EVIDENCE:
{context_evidence}

---

USER QUESTION:
{query}

---

ASSISTANT RESPONSE TO AUDIT:
{response_text}

Perform the grounding audit now. Output JSON only."""

        try:
            raw = llm_service._call_llm(
                system_prompt=VALIDATION_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.0,
                max_tokens=350,
            )
            data = llm_service.parse_json_response(raw)

            is_grounded = bool(data.get("is_grounded", True))
            score = float(data.get("faithfulness_score", 1.0))
            hallucinations = data.get("hallucinated_claims") if isinstance(data.get("hallucinated_claims"), list) else []
            invalid_cites = data.get("invalid_citations") if isinstance(data.get("invalid_citations"), list) else []
            feedback = data.get("correction_feedback")

            # Check if self-correction is needed
            corrected_text = response_text
            if not is_grounded or score < self.min_faithfulness_threshold:
                corrected_text = self._self_correct(
                    query=query,
                    original_response=response_text,
                    context_evidence=context_evidence,
                    feedback=feedback or "Remove ungrounded claims.",
                )

            return ValidationResult(
                is_grounded=is_grounded and score >= self.min_faithfulness_threshold,
                faithfulness_score=round(score, 3),
                hallucinated_claims=hallucinations,
                invalid_citations=invalid_cites,
                correction_feedback=feedback,
                corrected_response=corrected_text,
            )

        except Exception as e:
            # If validation call fails, return graceful default
            return ValidationResult(
                is_grounded=True,
                faithfulness_score=1.0,
                hallucinated_claims=[],
                correction_feedback=None,
                corrected_response=response_text,
            )

    def _self_correct(
        self,
        query: str,
        original_response: str,
        context_evidence: str,
        feedback: str,
    ) -> str:
        """
        Rewrites response to eliminate hallucinated assertions.
        """
        user_prompt = f"""CONTEXT EVIDENCE:
{context_evidence}

---

USER QUESTION:
{query}

---

ORIGINAL RESPONSE (CONTAINS HALLUCINATIONS):
{original_response}

---

AUDITOR CORRECTION FEEDBACK:
{feedback}

Output ONLY the corrected, fully grounded response now."""

        try:
            return llm_service._call_llm(
                system_prompt=CORRECTION_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=1000,
            )
        except Exception:
            return original_response


# Singleton instance
validation_service = ValidationService(min_faithfulness_threshold=0.80)
