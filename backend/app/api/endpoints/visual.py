"""
Visual Explain API — structured diagram data + numbered source citations.
LLM returns: (1) text with citations, (2) diagram structure JSON.
Frontend renders the actual SVG from the diagram structure.
"""
import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.services.rag_service import rag_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/visual", tags=["Visual"])


class VisualRequest(BaseModel):
    concept: str
    learner_type: str = "Visual"
    topic: Optional[str] = None
    top_k: int = 6


class Reference(BaseModel):
    num: int
    excerpt: str
    topic: Optional[str] = None
    source: Optional[str] = None
    score: float = 0.0


class DiagramNode(BaseModel):
    label: str
    color: str = "#6366f1"


class DiagramData(BaseModel):
    diagram_type: str = "hub_spoke"
    center: str
    nodes: List[DiagramNode]


class VisualResponse(BaseModel):
    title: str
    explanation: str
    highlights: List[str]
    references: List[Reference]
    diagram: DiagramData


_FALLBACK_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"]


def _fallback_diagram(title: str, highlights: list) -> DiagramData:
    """Returns a basic hub-spoke diagram built from highlights when LLM diagram call fails."""
    nodes = []
    for i, h in enumerate(highlights[:5]):
        label = h.split("[")[0].strip()[:30]  # strip citations
        nodes.append(DiagramNode(label=label, color=_FALLBACK_COLORS[i % len(_FALLBACK_COLORS)]))
    return DiagramData(
        diagram_type="hub_spoke",
        center=title[:20],
        nodes=nodes,
    )


@router.post("/explain", response_model=VisualResponse)
def visual_explain(body: VisualRequest):
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="Concept must not be empty.")

    # 1. Retrieve + number RAG chunks
    rag_results = rag_service.retrieve(
        query=body.concept,
        top_k=body.top_k,
        filter_topic=body.topic or None,
    )
    numbered_context = "\n\n".join(
        f"[{i+1}] {r['text']}" for i, r in enumerate(rag_results)
    )

    # 2. Call 1 — text (explanation, highlights, references)
    try:
        raw_text = llm_service.visual_explain_text(
            numbered_context=numbered_context,
            concept=body.concept,
            learner_type=body.learner_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error (text): {e}")

    try:
        clean = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.MULTILINE)
        clean = re.sub(r"\s*```$", "", clean.strip(), flags=re.MULTILINE)
        data  = json.loads(clean)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {e}. Raw: {raw_text[:400]}")

    title      = data.get("title", body.concept)
    highlights = data.get("highlights", [])

    # Build references
    references = []
    for ref in data.get("references", []):
        num = ref.get("num", 0)
        idx = num - 1
        rag = rag_results[idx] if 0 <= idx < len(rag_results) else {}
        references.append(Reference(
            num=num,
            excerpt=ref.get("excerpt", rag.get("text", "")[:100]),
            topic=rag.get("topic"),
            source=rag.get("source"),
            score=rag.get("score", 0.0),
        ))

    # 3. Call 2 — diagram structure (tiny JSON, very reliable)
    diagram: DiagramData
    try:
        raw_diagram = llm_service.visual_explain_diagram(
            concept=body.concept,
            title=title,
            highlights=highlights,
        )
        clean_d = re.sub(r"^```(?:json)?\s*", "", raw_diagram.strip(), flags=re.MULTILINE)
        clean_d = re.sub(r"\s*```$", "", clean_d.strip(), flags=re.MULTILINE)
        d = json.loads(clean_d)
        diagram = DiagramData(
            diagram_type=d.get("diagram_type", "hub_spoke"),
            center=d.get("center", title)[:30],
            nodes=[
                DiagramNode(label=n.get("label", "")[:30], color=n.get("color", "#6366f1"))
                for n in d.get("nodes", [])[:6]
            ],
        )
    except Exception as e:
        print(f"Diagram structure call failed, using fallback: {e}")
        diagram = _fallback_diagram(title, highlights)

    return VisualResponse(
        title=title,
        explanation=data.get("explanation", ""),
        highlights=highlights,
        references=references,
        diagram=diagram,
    )
