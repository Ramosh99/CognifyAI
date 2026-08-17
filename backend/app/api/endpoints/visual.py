"""
Visual Explain API — long-form article with interleaved SVG diagram blocks.
Single LLM call returns: title, sections[], references[]
sections[] is an ordered list of TextSection | ImageSection objects.
"""
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, TypeAdapter
from typing import Dict, List, Optional, Literal, Tuple, Union, Generator

from app.agents.note_composer_agent import compose_note, compose_note_events
from app.agents.research_note_graph import research_topic
from app.agents.visual_tools import build_diagram
from app.core.auth import get_current_user_id
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service
from app.services import layout_solver as ls

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


class LaidOutNode(BaseModel):
    id: str
    label: str
    color: str = "#6366f1"
    x: float
    y: float
    w: float
    h: float
    shape: Literal["rect", "circle"] = "rect"
    icon: Optional[dict] = None
    type: Optional[str] = None


class LaidOutEdge(BaseModel):
    source: str
    target: str
    label: Optional[str] = None
    points: List[Tuple[float, float]]
    marker: Literal["arrow", "none"] = "arrow"
    style: Optional[str] = None


class DiagramData(BaseModel):
    title: str = ""
    layout_type: str
    theme: str = "developer-dark"
    viewbox: Dict[str, float]
    nodes: List[LaidOutNode]
    edges: List[LaidOutEdge]


# ── Section types ──────────────────────────────────────────────────────────────

class TextSection(BaseModel):
    type: Literal["text"]
    heading: Optional[str] = None
    body: str


class ImageSection(BaseModel):
    type: Literal["image"]
    caption: str
    diagram: DiagramData
    purpose: Optional[str] = None
    placement_reason: Optional[str] = None


class SearchedImageSection(BaseModel):
    type: Literal["searched_image"]
    caption: str
    title: str
    image: str
    thumbnail: str
    url: str
    source: str
    purpose: Optional[str] = None
    placement_reason: Optional[str] = None


Section = Union[TextSection, ImageSection, SearchedImageSection]
SectionAdapter = TypeAdapter(Section)


# ── Response ───────────────────────────────────────────────────────────────────

class VisualResponse(BaseModel):
    title: str
    note_type: Optional[str] = None
    sections: List[Section]
    references: List[Reference]


# ── Helpers ────────────────────────────────────────────────────────────────────

_FALLBACK_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#f97316"]

VALID_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _safe_color(c: str, idx: int) -> str:
    return c if VALID_HEX.match(c) else _FALLBACK_COLORS[idx % len(_FALLBACK_COLORS)]


_MAX_NODES = 10


def _parse_diagram(raw: dict, fallback_label: str) -> DiagramData:
    """LLM-emitted graph plan → solved layout with geometry."""
    raw_nodes = raw.get("nodes", []) or []
    in_nodes: List[ls.InputNode] = []
    seen_ids: set[str] = set()
    for i, n in enumerate(raw_nodes[:_MAX_NODES]):
        nid = str(n.get("id") or f"n{i+1}")
        if nid in seen_ids:
            nid = f"{nid}_{i}"
        seen_ids.add(nid)
        in_nodes.append(ls.InputNode(
            id=nid,
            label=str(n.get("label", ""))[:60].strip() or f"Node {i+1}",
            color=_safe_color(n.get("color", ""), i),
            role=(n.get("role") or None),
        ))
    if not in_nodes:
        in_nodes = [ls.InputNode(id="n1", label=fallback_label or "Key concept", color="#6366f1")]

    valid_ids = {n.id for n in in_nodes}
    in_edges: List[ls.InputEdge] = []
    for e in (raw.get("edges", []) or [])[:30]:
        src = str(e.get("source") or e.get("from") or "")
        dst = str(e.get("target") or e.get("to") or "")
        if src in valid_ids and dst in valid_ids and src != dst:
            in_edges.append(ls.InputEdge(
                src=src, dst=dst,
                label=(str(e["label"])[:30] if e.get("label") else None),
            ))

    plan = ls.GraphPlan(
        title=str(raw.get("title", fallback_label))[:60],
        nodes=in_nodes,
        edges=in_edges,
        intent=(raw.get("intent") or None),
    )
    solved = ls.solve(plan)

    return DiagramData(
        title=solved.title,
        layout_type=solved.layout_type,
        viewbox=solved.viewbox,
        nodes=[
            LaidOutNode(
                id=n.id, label=n.label, color=n.color,
                x=n.x, y=n.y, w=n.w, h=n.h, shape=n.shape,
            ) for n in solved.nodes
        ],
        edges=[
            LaidOutEdge(
                source=e.src, target=e.dst, label=e.label,
                points=e.points, marker=e.marker,
            ) for e in solved.edges
        ],
    )


# def _parse_sections(raw_sections: list, concept: str) -> List[Section]:
#     sections: List[Section] = []
#     for s in raw_sections:
#         t = s.get("type")
#         if t == "text":
#             body = s.get("body", "").strip()
#             if body:
#                 sections.append(TextSection(
#                     type="text",
#                     heading=s.get("heading") or None,
#                     body=body,
#                 ))
#         elif t == "image":
#             diagram_raw = s.get("diagram", {})
#             sections.append(ImageSection(
#                 type="image",
#                 caption=s.get("caption", "Diagram")[:200],
#                 diagram=_parse_diagram(diagram_raw, concept),
#             ))
#     return sections or [TextSection(type="text", body="No content was generated. Please try again.")]


# def _add_default_diagrams(sections: List[Section], concept: str) -> List[Section]:
#     if any(getattr(section, "type", None) == "image" for section in sections):
#         return sections

#     out: List[Section] = []
#     text_seen = 0
#     for section in sections:
#         out.append(section)
#         if section.type != "text":
#             continue
#         text_seen += 1
#         if text_seen in {1, 3}:
#             diagram_text = f"{section.heading or concept}\n\n{section.body}"
#             diagram = DiagramData.model_validate(build_diagram(diagram_text).model_dump())
#             out.append(ImageSection(
#                 type="image",
#                 caption=f"Auto-generated visual map for {section.heading or concept}",
#                 diagram=diagram,
#             ))
#     return out


# def _fallback_article_data(concept: str, rag_results: List[dict]) -> dict:
#     source_hint = ""
#     references = []
#     for i, result in enumerate(rag_results[:3], start=1):
#         excerpt = result.get("text", "")[:100]
#         if excerpt:
#             references.append({"num": i, "excerpt": excerpt})
#             source_hint += f" [{i}]"

#     intro_cite = " [1]" if references else ""
#     return {
#         "title": f"{concept.strip()[:80] or 'Visual Explanation'}",
#         "sections": [
#             {
#                 "type": "text",
#                 "body": (
#                     f"{concept} can be understood as a connected system of ideas rather than a single isolated fact."
#                     f"{intro_cite} Start by identifying the main state, process, or object, then trace how information, "
#                     "control, or cause-and-effect moves through it."
#                 ),
#             },
#             {
#                 "type": "text",
#                 "heading": "Core Structure",
#                 "body": (
#                     "A useful visual explanation separates the concept into nodes and transitions. Nodes represent "
#                     "important conditions, stages, or components. Transitions show what causes movement from one node "
#                     "to another. This is especially helpful for state-machine topics, workflows, protocols, and systems "
#                     "where behavior changes after an event."
#                 ),
#             },
#             {
#                 "type": "text",
#                 "heading": "How To Read It",
#                 "body": (
#                     "Read the diagram from the starting point, follow each arrow, and ask what event or rule makes the "
#                     "system change. Loops usually mean repeated behavior. Branches usually mean decisions. End states "
#                     "show completion, failure, or a stable condition."
#                 ),
#             },
#         ],
#         "references": references,
#     }


# def _strip_fences(raw: str) -> str:
#     clean = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
#     clean = re.sub(r"\s*```$", "", clean.strip(), flags=re.MULTILINE)
#     return clean.strip()


def _references_from_composer(composer_refs, rag_results: List[dict]) -> List[Reference]:
    references: List[Reference] = []
    for ref in composer_refs:
        num = ref.num
        idx = num - 1
        rag = rag_results[idx] if 0 <= idx < len(rag_results) else {}
        references.append(Reference(
            num=num,
            excerpt=(ref.excerpt or rag.get("text", ""))[:120],
            topic=rag.get("topic"),
            source=rag.get("url") or rag.get("source"),
            score=rag.get("score", 0.0),
        ))
    return references


def _numbered_context(results: List[dict]) -> str:
    return "\n\n".join(
        f"[{i+1}] {r['text'][:_CHUNK_CHAR_LIMIT]}" for i, r in enumerate(results) if r.get("text")
    )


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
    research = research_topic(body.concept)
    source_results = [*rag_results, *research["sources"]]
    numbered_context = _numbered_context(source_results)

    # 2. Single LLM call → full article JSON
    note = compose_note(
        concept=body.concept,
        numbered_context=numbered_context,
        learner_type=body.learner_type,
        rag_results=source_results,
    )

    return VisualResponse(
        title=note.title,
        note_type=note.note_type,
        sections=[SectionAdapter.validate_python(section.model_dump()) for section in note.sections],
        references=_references_from_composer(note.references, source_results),
    )


# ── SSE Streaming endpoint ─────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    """Format a single Server-Sent Event."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _stream_visual(body: VisualRequest, user_id: str) -> Generator[str, None, None]:
    yield _sse("status", {
        "phase": "retrieving_sources",
        "message": "Retrieving your source passages...",
        "detail": body.topic or body.concept,
    })
    """Generator that yields SSE events: title → section (one per chunk) → references → done."""
    # 1. RAG — scoped to this user
    rag_results = rag_service.retrieve(
        query=body.concept,
        user_id=user_id,
        top_k=body.top_k,
        filter_topic=body.topic or None,
    )
    yield _sse("status", {
        "phase": "classifying_topic",
        "message": "Classifying topic domain and sensitivity...",
        "detail": body.concept,
    })
    yield _sse("status", {
        "phase": "researching_sources",
        "message": "Researching public sources for this topic...",
        "detail": "Wikipedia and web search",
    })
    research = research_topic(body.concept)
    source_results = [*rag_results, *research["sources"]]
    profile = research["profile"]
    yield _sse("status", {
        "phase": "researching_sources",
        "message": f"Found {len(source_results)} source passage(s).",
        "detail": f"{profile['topic_domain']} · {profile['sensitivity_level']} sensitivity",
    })
    numbered_context = _numbered_context(source_results)

    for event in compose_note_events(
        concept=body.concept,
        numbered_context=numbered_context,
        learner_type=body.learner_type,
        rag_results=source_results,
    ):
        if event["event"] == "references_raw":
            references = _references_from_composer(event["data"], source_results)
            yield _sse("references", {"references": [r.model_dump() for r in references]})
        else:
            yield _sse(event["event"], event["data"])

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
    diagram = build_diagram(text)
    return QuickDiagramResponse(diagram=DiagramData.model_validate(diagram.model_dump()))
