"""
Context & Prompt Construction Engine (Stages 4.3 & 4.4)
-------------------------------------------------------
Handles:
  4.3 Context Construction: Deduplication, parent chunk expansion, hierarchy formatting,
      and token budget management.
  4.4 Prompt Construction: Strict grounding instructions, inline citation requirements ([1], [2]),
      and explicit refusal guidance when evidence is insufficient.
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from app.services.rerank_service import RerankedChunk


@dataclass
class ConstructedContext:
    formatted_context: str
    evidence_items: List[Dict[str, Any]]
    total_characters: int
    has_sufficient_evidence: bool


GROUNDED_RAG_SYSTEM_PROMPT = """
You are CognifyAI's enterprise truth-grounded AI tutor and assistant.
You answer user questions STRICTLY using the provided evidence passages.

CRITICAL RULES:
1. Grounding: Answer ONLY based on the facts directly stated in the CONTEXT below. Do NOT assume, extrapolate, or use outside knowledge.
2. Refusal Behavior: If the CONTEXT does not contain enough direct evidence to fully answer the question, explicitly state:
   "Based on your uploaded documents, I do not have enough information to answer this question."
3. Citations: Every single factual claim must cite its source passage number using brackets (e.g., [1] or [2]).
4. Formatting: Be concise, clear, and structured. Use bullet points for multi-part explanations.
5. Zero Hallucination: Never invent dates, numbers, policies, names, or technical terms not present in the context.
"""


class ContextService:
    def __init__(self, max_token_budget: int = 6000, expand_parent_context: bool = True):
        # Token budget (1 token ≈ 4 chars). Gemini 1.5 Flash supports 1M context
        # but we cap at 6000 tokens to keep generation fast and focused.
        self.max_token_budget = max_token_budget
        self.expand_parent_context = expand_parent_context

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """Approximate token count using the 4-chars-per-token heuristic."""
        return max(1, len(text) // 4)

    def construct_context(
        self,
        chunks: List[RerankedChunk],
        query: str,
    ) -> ConstructedContext:
        """
        Deduplicates, re-orders, expands parent sections, and formats chunks into
        a numbered evidence block for the LLM.
        """
        if not chunks:
            return ConstructedContext(
                formatted_context="NO EVIDENCE FOUND IN DOCUMENTS.",
                evidence_items=[],
                total_characters=0,
                has_sufficient_evidence=False,
            )

        seen_content = set()
        evidence_items: List[Dict[str, Any]] = []
        formatted_blocks: List[str] = []
        current_chars = 0

        for idx, chunk in enumerate(chunks, start=1):
            # Select text or parent context
            content = (
                chunk.parent_text
                if (self.expand_parent_context and chunk.parent_text and len(chunk.parent_text) > len(chunk.text))
                else chunk.text
            ).strip()

            # Deduplication
            normalized_snippet = content[:150].lower()
            if normalized_snippet in seen_content:
                continue
            seen_content.add(normalized_snippet)

            # Check character budget
            block_header = f"--- EVIDENCE [{idx}] ---\nSource: {chunk.doc_title}"
            if chunk.section_title:
                block_header += f" > {chunk.section_title}"
            if chunk.department:
                block_header += f" (Dept: {chunk.department})"

            block_text = f"{block_header}\nRelevance Score: {chunk.relevance_score:.2f}\nContent:\n{content}\n"
            block_tokens = self._estimate_tokens(block_text)

            if current_chars + block_tokens > self.max_token_budget and evidence_items:
                break

            formatted_blocks.append(block_text)
            current_chars += block_tokens

            evidence_items.append({
                "num": idx,
                "text": chunk.text,
                "parent_text": content,
                "doc_title": chunk.doc_title,
                "section_title": chunk.section_title,
                "score": chunk.relevance_score,
                "source": chunk.source,
                "department": chunk.department,
            })

        formatted_context = "\n".join(formatted_blocks)

        return ConstructedContext(
            formatted_context=formatted_context,
            evidence_items=evidence_items,
            total_characters=current_chars,
            has_sufficient_evidence=len(evidence_items) > 0,
        )

    def build_grounded_prompt(
        self,
        query: str,
        constructed_context: ConstructedContext,
    ) -> Tuple[str, str]:
        """
        Builds the system prompt and user prompt pair with strict truth-grounding.
        """
        system_prompt = GROUNDED_RAG_SYSTEM_PROMPT

        user_prompt = f"""CONTEXT EVIDENCE:
{constructed_context.formatted_context}

---

USER QUESTION:
{query}

Provide a grounded, cited answer using ONLY the evidence above. Cite inline as [1], [2], etc."""

        return system_prompt, user_prompt


# Singleton instance — 6000 token budget (~24k chars), expands to parent sections
context_service = ContextService(max_token_budget=6000, expand_parent_context=True)
