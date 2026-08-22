"""
Re-ranking & Relevance Filtering Service (Stages 4.1 & 4.2)
----------------------------------------------------------
Examines candidate chunks against the specific user query, assigns a cross-attention
relevance score, and filters out low-confidence evidence below a strict threshold.
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import math

from app.services.llm_service import llm_service


@dataclass
class RerankedChunk:
    text: str
    parent_text: str
    doc_title: str
    section_title: str
    relevance_score: float
    raw_score: float
    source: Optional[str] = None
    department: Optional[str] = None
    original_index: int = 0


RERANK_PROMPT = """
You are an expert retrieval re-ranker. 
Evaluate how directly and accurately the following candidate passage answers or provides evidence for the user query.

Assign a relevance score from 0.00 to 1.00:
- 0.90 to 1.00: Directly answers the core query with specific, factual evidence.
- 0.70 to 0.89: Highly relevant context or partial answer.
- 0.50 to 0.69: Related topic, but does not directly answer the specific question.
- 0.00 to 0.49: Irrelevant, generic, or off-topic.

Output ONLY valid JSON matching this schema:
{"scores": [0.95, 0.42, 0.88, ...]}
"""


class RerankService:
    def __init__(self, min_relevance_threshold: float = 0.55, max_output_chunks: int = 5):
        self.min_relevance_threshold = min_relevance_threshold
        self.max_output_chunks = max_output_chunks

    def rerank_and_filter(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        min_threshold: Optional[float] = None,
        top_n: Optional[int] = None,
    ) -> List[RerankedChunk]:
        """
        Takes candidate chunks from vector/hybrid retrieval, scores their direct relevance
        to the query, and filters out noise.
        """
        if not candidates:
            return []

        threshold = min_threshold if min_threshold is not None else self.min_relevance_threshold
        limit = top_n if top_n is not None else self.max_output_chunks

        # If candidates are already very few (e.g. <= 2), normalize and return
        if len(candidates) <= 2:
            return [
                RerankedChunk(
                    text=c.get("text", ""),
                    parent_text=c.get("parent_text") or c.get("text", ""),
                    doc_title=c.get("doc_title") or "Document",
                    section_title=c.get("section_title") or "",
                    relevance_score=float(c.get("score", 0.8)),
                    raw_score=float(c.get("score", 0.8)),
                    source=c.get("source"),
                    department=c.get("department"),
                    original_index=i,
                )
                for i, c in enumerate(candidates)
                if float(c.get("score", 1.0)) >= (threshold - 0.2)
            ]

        # Evaluate candidate passages with LLM batch scorer (or fast cross-encoder)
        passages_text = "\n\n".join(
            f"Passage [{i+1}] (From '{c.get('doc_title') or 'Doc'} > {c.get('section_title') or 'Section'}'):\n{c.get('text', '')[:400]}"
            for i, c in enumerate(candidates[:15])  # evaluate top 15 candidates
        )

        user_prompt = f"USER QUERY:\n{query}\n\nCANDIDATE PASSAGES:\n{passages_text}\n\nReturn the JSON array of scores now."

        scores: List[float] = []
        try:
            raw = llm_service._call_llm(
                system_prompt=RERANK_PROMPT,
                user_prompt=user_prompt,
                temperature=0.0,
                max_tokens=200,
            )
            data = llm_service.parse_json_response(raw)
            if isinstance(data, dict) and "scores" in data:
                scores = [float(s) for s in data["scores"]]
            elif isinstance(data, list):
                scores = [float(s) for s in data]
        except Exception:
            # Fallback to normalized raw hybrid retrieval scores
            scores = [float(c.get("score", 0.5)) for c in candidates]

        # Pad scores if LLM returned fewer
        while len(scores) < len(candidates):
            scores.append(float(candidates[len(scores)].get("score", 0.5)))

        reranked: List[RerankedChunk] = []
        for i, c in enumerate(candidates[:len(scores)]):
            score = scores[i]
            # 4.2 Relevance Filtering: Discard below threshold
            if score >= threshold:
                reranked.append(
                    RerankedChunk(
                        text=c.get("text", ""),
                        parent_text=c.get("parent_text") or c.get("text", ""),
                        doc_title=c.get("doc_title") or "Document",
                        section_title=c.get("section_title") or "",
                        relevance_score=round(score, 4),
                        raw_score=float(c.get("score", 0.0)),
                        source=c.get("source"),
                        department=c.get("department"),
                        original_index=i,
                    )
                )

        # Sort descending by relevance score
        reranked.sort(key=lambda x: x.relevance_score, reverse=True)
        return reranked[:limit]


# Singleton instance
rerank_service = RerankService(min_relevance_threshold=0.55, max_output_chunks=5)
