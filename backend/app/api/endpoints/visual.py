"""
Visual Explain API — long-form article with interleaved SVG diagram blocks.
Single LLM call returns: title, sections[], references[]
sections[] is an ordered list of TextSection | ImageSection objects.
"""
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Literal, Union, Generator

from app.core.auth import get_current_user_id
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service

router = APIRouter(prefix="/visual", tags=["Visual"])


# ── Request ────────────────────────────────────────────────────────────────────

# Max chars per RAG chunk sent to LLM — keeps total input well under limits
_CHUNK_CHAR_LIMIT = 350

class VisualRequest(BaseModel):
    concept: str
    learner_type: str = "Visual"
    topic: Optional[str] = None
    top_k: int = 3   # 3 sharp chunks is plenty for the article


# ── Shared sub-models ──────────────────────────────────────────────────────────

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


# ── Section types ──────────────────────────────────────────────────────────────

class TextSection(BaseModel):
    type: Literal["text"]
    heading: Optional[str] = None
    body: str


class ImageSection(BaseModel):
    type: Literal["image"]
    caption: str
    diagram: DiagramData


Section = Union[TextSection, ImageSection]


# ── Response ───────────────────────────────────────────────────────────────────

class VisualResponse(BaseModel):
    title: str
    sections: List[Section]
    references: List[Reference]


# ── Helpers ────────────────────────────────────────────────────────────────────

_FALLBACK_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#f97316"]

VALID_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _safe_color(c: str, idx: int) -> str:
    return c if VALID_HEX.match(c) else _FALLBACK_COLORS[idx % len(_FALLBACK_COLORS)]


def _parse_diagram(raw: dict, fallback_label: str) -> DiagramData:
    nodes = []
    for i, n in enumerate(raw.get("nodes", [])[:6]):
        nodes.append(DiagramNode(
            label=str(n.get("label", ""))[:30],
            color=_safe_color(n.get("color", ""), i),
        ))
    if not nodes:
        nodes = [DiagramNode(label="Key concept", color="#6366f1")]
    return DiagramData(
        diagram_type=raw.get("diagram_type", "hub_spoke"),
        center=str(raw.get("center", fallback_label))[:25],
        nodes=nodes,
    )


def _parse_sections(raw_sections: list, concept: str) -> List[Section]:
    sections: List[Section] = []
    for s in raw_sections:
        t = s.get("type")
        if t == "text":
            body = s.get("body", "").strip()
            if body:
                sections.append(TextSection(
                    type="text",
                    heading=s.get("heading") or None,
                    body=body,
                ))
        elif t == "image":
            diagram_raw = s.get("diagram", {})
            sections.append(ImageSection(
                type="image",
                caption=s.get("caption", "Diagram")[:200],
                diagram=_parse_diagram(diagram_raw, concept),
            ))
    return sections or [TextSection(type="text", body="No content was generated. Please try again.")]


def _strip_fences(raw: str) -> str:
    clean = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    clean = re.sub(r"\s*```$", "", clean.strip(), flags=re.MULTILINE)
    return clean.strip()


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/explain", response_model=VisualResponse)
def visual_explain(
    body: VisualRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="Concept must not be empty.")

    # 1. Retrieve RAG context — scoped to this user
    rag_results = rag_service.retrieve(
        query=body.concept,
        user_id=user_id,
        top_k=body.top_k,
        filter_topic=body.topic or None,
    )
    # Truncate each chunk to avoid 413 "request too large" from Groq
    numbered_context = "\n\n".join(
        f"[{i+1}] {r['text'][:_CHUNK_CHAR_LIMIT]}" for i, r in enumerate(rag_results)
    )

    # 2. Single LLM call → full article JSON
    try:
        raw = llm_service.visual_explain_article(
            numbered_context=numbered_context,
            concept=body.concept,
            learner_type=body.learner_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM returned invalid JSON: {e}. Raw (first 500 chars): {raw[:500]}",
        )

    # 3. Parse sections
    sections = _parse_sections(data.get("sections", []), body.concept)

    # 4. Parse references
    references: List[Reference] = []
    for ref in data.get("references", []):
        num = ref.get("num", 0)
        idx = num - 1
        rag = rag_results[idx] if 0 <= idx < len(rag_results) else {}
        references.append(Reference(
            num=num,
            excerpt=ref.get("excerpt", rag.get("text", ""))[:120],
            topic=rag.get("topic"),
            source=rag.get("source"),
            score=rag.get("score", 0.0),
        ))

    return VisualResponse(
        title=data.get("title", body.concept),
        sections=sections,
        references=references,
    )


# ── SSE Streaming endpoint ─────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """Format a single Server-Sent Event."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _stream_visual(body: VisualRequest, user_id: str) -> Generator[str, None, None]:
    """Generator that yields SSE events: title → section (one per chunk) → references → done."""
    # 1. RAG — scoped to this user
    rag_results = rag_service.retrieve(
        query=body.concept,
        user_id=user_id,
        top_k=body.top_k,
        filter_topic=body.topic or None,
    )
    numbered_context = "\n\n".join(
        f"[{i+1}] {r['text'][:_CHUNK_CHAR_LIMIT]}" for i, r in enumerate(rag_results)
    )

    # 2. LLM call (full JSON, but we'll parse & stream sections)
    try:
        raw = llm_service.visual_explain_article(
            numbered_context=numbered_context,
            concept=body.concept,
            learner_type=body.learner_type,
        )
    except Exception as e:
        yield _sse("error", {"detail": f"LLM error: {e}"})
        return

    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError as e:
        yield _sse("error", {"detail": f"Invalid JSON: {e}"})
        return

    # 3. Emit title
    yield _sse("title", {"title": data.get("title", body.concept)})

    # 4. Emit sections one-by-one
    sections = _parse_sections(data.get("sections", []), body.concept)
    for section in sections:
        yield _sse("section", section.model_dump())

    # 5. Emit references
    references: List[Reference] = []
    for ref in data.get("references", []):
        num = ref.get("num", 0)
        idx = num - 1
        rag = rag_results[idx] if 0 <= idx < len(rag_results) else {}
        references.append(Reference(
            num=num,
            excerpt=ref.get("excerpt", rag.get("text", ""))[:120],
            topic=rag.get("topic"),
            source=rag.get("source"),
            score=rag.get("score", 0.0),
        ))
    yield _sse("references", {"references": [r.model_dump() for r in references]})

    # 6. Done
    yield _sse("done", {})


@router.post("/explain/stream")
def visual_explain_stream(
    body: VisualRequest,
    user_id: str = Depends(get_current_user_id),
):
    """SSE endpoint — emits sections progressively. Only uses the user's own documents."""
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="Concept must not be empty.")
    return StreamingResponse(
        _stream_visual(body, user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Quick diagram from selected text ──────────────────────────────────────────

class QuickDiagramRequest(BaseModel):
    text: str


class QuickDiagramResponse(BaseModel):
    diagram: DiagramData


@router.post("/diagram", response_model=QuickDiagramResponse)
def quick_diagram(
    body: QuickDiagramRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a single diagram from a user-selected text snippet."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty.")
    try:
        raw = llm_service.generate_diagram_from_selection(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid diagram JSON: {e}")
    return QuickDiagramResponse(diagram=_parse_diagram(data, text[:25]))
