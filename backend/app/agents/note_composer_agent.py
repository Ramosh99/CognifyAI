from typing import Any, Dict, Generator, List, Literal, Optional

from pydantic import BaseModel

from app.agents.chat_tools.image_search import search_images
from app.agents.visual_tools import build_diagram
from app.services.llm_service import llm_service


class ComposerTextSection(BaseModel):
    type: Literal["text"] = "text"
    heading: Optional[str] = None
    body: str


class ComposerDiagramSection(BaseModel):
    type: Literal["image"] = "image"
    caption: str
    diagram: Dict[str, Any]
    purpose: Optional[str] = None
    placement_reason: Optional[str] = None


class ComposerSearchedImageSection(BaseModel):
    type: Literal["searched_image"] = "searched_image"
    caption: str
    title: str
    image: str
    thumbnail: str
    url: str
    source: str
    purpose: Optional[str] = None
    placement_reason: Optional[str] = None


class ComposerReference(BaseModel):
    num: int
    excerpt: str


class ComposedNote(BaseModel):
    title: str
    note_type: str
    sections: List[ComposerTextSection | ComposerDiagramSection | ComposerSearchedImageSection]
    references: List[ComposerReference]


ComposerEvent = Dict[str, Any]


def _status(
    phase: str,
    message: str,
    *,
    detail: Optional[str] = None,
    current: Optional[int] = None,
    total: Optional[int] = None,
) -> ComposerEvent:
    data: Dict[str, Any] = {
        "phase": phase,
        "message": message,
    }
    if detail is not None:
        data["detail"] = detail
    if current is not None:
        data["current"] = current
    if total is not None:
        data["total"] = total
    return {"event": "status", "data": data}


def _fallback_note_data(concept: str, rag_results: List[dict]) -> Dict[str, Any]:
    references = []
    for i, result in enumerate(rag_results[:3], start=1):
        excerpt = result.get("text", "")[:100]
        if excerpt:
            references.append({"num": i, "excerpt": excerpt})

    cite = " [1]" if references else ""
    source_summary = " ".join(str(result.get("text", ""))[:260] for result in rag_results[:2]).strip()
    grounding = (
        f" Available source context describes: {source_summary[:360]}."
        if source_summary
        else ""
    )
    return {
        "title": concept.strip()[:80] or "Study Note",
        "note_type": "conceptual_explainer",
        "sections": [
            {
                "type": "text",
                "body": (
                    f"{concept} should be studied as a focused explanatory note rather than a short definition.{cite}"
                    f"{grounding} Start by identifying what the term means, the context where it appears, and why it matters "
                    "for learners. A strong note separates definition, causes or mechanisms, examples, consequences, and "
                    "exam-ready distinctions, so the topic becomes understandable without mixing it with unrelated fields. "
                    "This also helps the learner notice whether a later diagram or image is genuinely explaining the topic."
                ),
            },
            {
                "type": "text",
                "heading": "Core Meaning",
                "body": (
                    f"The core meaning of {concept} should be stated in plain language first, then refined with technical detail. "
                    "The learner should be able to answer three questions: what the topic is, what it is not, and what features "
                    "make it recognizable. When sources are available, the safest approach is to keep the wording close to the "
                    "source and avoid adding unsupported claims. This makes the note useful for both revision and explanation."
                    " In an exam answer, this section should usually be short but exact, because unclear definitions often cause "
                    "the rest of the answer to drift away from the requested topic."
                ),
            },
            {
                "type": "text",
                "heading": "Background and Context",
                "body": (
                    "Background context explains where the topic belongs in a wider subject area. This section should connect "
                    "the term to related concepts, common situations, and the vocabulary a student is likely to meet in class "
                    "or exams. If the topic is sensitive, such as health, law, or finance, the note should describe concepts "
                    "educationally and avoid presenting itself as personal professional advice. Context also helps separate the "
                    "topic from similar terms that may sound related but belong to a different explanation."
                ),
            },
            {
                "type": "text",
                "heading": "Mechanism or Explanation",
                "body": (
                    "A useful note should explain the mechanism behind the topic: the process, causes, structure, or chain of "
                    "events that makes the concept work. For abstract topics, this may be a relationship map. For scientific "
                    "topics, it may be a pathway, system, or set of contributing factors. This section should avoid vague wording "
                    "and focus on the specific features that would help a learner recognize the topic in an exam question."
                    " When a mechanism is uncertain or varies by case, the note should say so rather than forcing a single simple cause."
                ),
            },
            {
                "type": "text",
                "heading": "Examples and Recognition",
                "body": (
                    "Examples make the note concrete. They should be chosen because they clarify the definition, not because they "
                    "are merely interesting. A good example shows how the topic appears in real situations, what signs or features "
                    "identify it, and how it differs from nearby ideas. This is also where a learner can connect the term to diagrams, "
                    "case descriptions, historical examples, or practical observations."
                    " The best examples are specific enough to remember but general enough that they do not become misleading."
                ),
            },
            {
                "type": "text",
                "heading": "Study Takeaway",
                "body": (
                    "For revision, compress the topic into a definition, two or three key features, one mechanism, and one example. "
                    "Then test whether the explanation still makes sense when the headings are hidden. If the topic is high sensitivity, "
                    "remember that the note is for education only: it should explain concepts accurately, cite sources when possible, "
                    "and avoid diagnosis, treatment instructions, legal advice, or financial recommendations."
                    " A good final check is whether every heading, source, image, and diagram still points back to the original topic."
                ),
            },
        ],
        "visual_plan": [
            {
                "after_section_index": 0,
                "visual_type": "diagram",
                "purpose": "Show the main topic and its surrounding context before details begin.",
                "query": f"{concept} overview concept map",
                "placement_reason": "The opening diagram anchors the reader before the detailed explanation.",
            },
            {
                "after_section_index": 1,
                "visual_type": "searched_image",
                "purpose": "Provide a real educational reference image related to the core meaning.",
                "query": f"{concept} Wikimedia Commons educational image",
                "placement_reason": "A reference image after the definition helps ground the term visually.",
            },
            {
                "after_section_index": 2,
                "visual_type": "diagram",
                "purpose": "Map the topic to its wider background and related ideas.",
                "query": f"{concept} background context diagram",
                "placement_reason": "This belongs after the context section because it organizes related concepts.",
            },
            {
                "after_section_index": 3,
                "visual_type": "diagram",
                "purpose": "Visualize the mechanism or explanatory pathway.",
                "query": f"{concept} mechanism explanatory diagram",
                "placement_reason": "A mechanism visual belongs after the explanation section to make the process easier to remember.",
            },
            {
                "after_section_index": 4,
                "visual_type": "searched_image",
                "purpose": "Add a real-world or educational visual reference for the examples.",
                "query": f"{concept} examples Wikimedia Commons",
                "placement_reason": "An example image belongs after examples because it connects the note to recognizable cases.",
            },
            {
                "after_section_index": 5,
                "visual_type": "diagram",
                "purpose": "Summarize the main points as an exam-ready memory map.",
                "query": f"{concept} study summary diagram",
                "placement_reason": "A final summary diagram helps the learner remember the note.",
            },
        ],
        "references": references,
    }


def _text_sections(data: Dict[str, Any]) -> List[ComposerTextSection]:
    sections = []
    for raw in data.get("sections", []):
        if raw.get("type") != "text":
            continue
        body = str(raw.get("body") or "").strip()
        if not body:
            continue
        sections.append(
            ComposerTextSection(
                heading=raw.get("heading") or None,
                body=body,
            )
        )
    return sections


def _fallback_visual_plan(concept: str, sections: List[ComposerTextSection]) -> List[Dict[str, Any]]:
    if not sections:
        return []
    slots = []
    for index, section in enumerate(sections[:6]):
        visual_type = "searched_image" if index in {1, 4} else "diagram"
        heading = section.heading or "overview"
        slots.append(
            {
                "after_section_index": index,
                "visual_type": visual_type,
                "purpose": f"Clarify the {heading.lower()} section with a meaningful visual.",
                "query": f"{concept} {heading} {'Wikimedia Commons' if visual_type == 'searched_image' else 'diagram'}",
                "placement_reason": "The visual is placed immediately after the paragraph it explains.",
            }
        )
    return slots


def _clean_visual_plan(data: Dict[str, Any], concept: str, sections: List[ComposerTextSection]) -> List[Dict[str, Any]]:
    plan = data.get("visual_plan") or _fallback_visual_plan(concept, sections)
    cleaned = []
    max_index = max(0, len(sections) - 1)
    covered_indexes = set()
    for raw in plan[:7]:
        visual_type = raw.get("visual_type")
        if visual_type not in {"diagram", "searched_image"}:
            visual_type = "diagram"
        after_index = min(max(int(raw.get("after_section_index", 0)), 0), max_index)
        covered_indexes.add(after_index)
        cleaned.append(
            {
                "after_section_index": after_index,
                "visual_type": visual_type,
                "purpose": str(raw.get("purpose") or "Clarify the nearby section."),
                "query": str(raw.get("query") or concept),
                "placement_reason": str(raw.get("placement_reason") or "Placed near the related explanation."),
            }
        )
    for index, section in enumerate(sections[:7]):
        if index in covered_indexes:
            continue
        heading = section.heading or "overview"
        visual_type = "searched_image" if index in {1, 4} else "diagram"
        cleaned.append(
            {
                "after_section_index": index,
                "visual_type": visual_type,
                "purpose": f"Support the {heading.lower()} paragraph with a directly related visual.",
                "query": f"{concept} {heading} {'Wikimedia Commons educational image' if visual_type == 'searched_image' else 'exam diagram'}",
                "placement_reason": "Added by the composer because every major paragraph should have a visual.",
            }
        )
    return cleaned


def _safe_num(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _diagram_section(slot: Dict[str, Any], nearby_text: str) -> ComposerDiagramSection | None:
    try:
        diagram = build_diagram(f"{slot['query']}\n\nPurpose: {slot['purpose']}\n\n{nearby_text}")
        return ComposerDiagramSection(
            caption=slot["purpose"],
            diagram=diagram.model_dump(),
            purpose=slot["purpose"],
            placement_reason=slot["placement_reason"],
        )
    except Exception:
        return None


def _searched_image_section(slot: Dict[str, Any]) -> ComposerSearchedImageSection | None:
    result = search_images(query=slot["query"], history=[], topic=None)
    for block in result.get("blocks", []):
        if block.get("type") != "image_results":
            continue
        images = block.get("results") or []
        if not images:
            continue
        image = images[0]
        return ComposerSearchedImageSection(
            caption=slot["purpose"],
            title=image.get("title", "Image reference"),
            image=image.get("image", ""),
            thumbnail=image.get("thumbnail", "") or image.get("image", ""),
            url=image.get("url", "") or image.get("image", ""),
            source=image.get("source", ""),
            purpose=slot["purpose"],
            placement_reason=slot["placement_reason"],
        )
    return None


def _planned_note_data(
    *,
    concept: str,
    numbered_context: str,
    learner_type: str,
    rag_results: List[dict],
) -> Dict[str, Any]:
    try:
        raw = llm_service.compose_note_article(
            numbered_context=numbered_context,
            concept=concept,
            learner_type=learner_type,
        )
        data = llm_service.parse_json_response(raw)
    except Exception:
        data = _fallback_note_data(concept, rag_results)

    sections = _text_sections(data)
    total_words = sum(len(section.body.split()) for section in sections)
    if len(sections) < 5 or total_words < 450:
        data = _fallback_note_data(concept, rag_results)
    return data


def _interleave_visuals(
    *,
    concept: str,
    sections: List[ComposerTextSection],
    visual_plan: List[Dict[str, Any]],
) -> List[ComposerTextSection | ComposerDiagramSection | ComposerSearchedImageSection]:
    by_index: Dict[int, List[Dict[str, Any]]] = {}
    for slot in visual_plan:
        by_index.setdefault(slot["after_section_index"], []).append(slot)

    output: List[ComposerTextSection | ComposerDiagramSection | ComposerSearchedImageSection] = []
    for index, section in enumerate(sections):
        output.append(section)
        for slot in by_index.get(index, []):
            visual = None
            if slot["visual_type"] == "searched_image":
                visual = _searched_image_section(slot)
            if visual is None:
                nearby_text = f"{section.heading or concept}\n{section.body}"
                visual = _diagram_section(slot, nearby_text)
            if visual is not None:
                output.append(visual)
    return output


def compose_note(
    *,
    concept: str,
    numbered_context: str,
    learner_type: str,
    rag_results: List[dict],
) -> ComposedNote:
    data = _planned_note_data(
        concept=concept,
        numbered_context=numbered_context,
        learner_type=learner_type,
        rag_results=rag_results,
    )
    sections = _text_sections(data)
    visual_plan = _clean_visual_plan(data, concept, sections)
    return ComposedNote(
        title=str(data.get("title") or concept),
        note_type=str(data.get("note_type") or "conceptual_explainer"),
        sections=_interleave_visuals(
            concept=concept,
            sections=sections,
            visual_plan=visual_plan,
        ),
        references=[
            ComposerReference(num=_safe_num(ref.get("num")), excerpt=str(ref.get("excerpt", ""))[:120])
            for ref in data.get("references", [])
            if _safe_num(ref.get("num")) > 0
        ],
    )


def compose_note_events(
    *,
    concept: str,
    numbered_context: str,
    learner_type: str,
    rag_results: List[dict],
) -> Generator[ComposerEvent, None, None]:
    yield _status(
        "planning_note",
        "Planning the best note format for this request...",
        detail=concept,
    )
    yield _status(
        "writing_article",
        "Writing 5-7 exam-ready note sections...",
        detail=learner_type,
    )
    data = _planned_note_data(
        concept=concept,
        numbered_context=numbered_context,
        learner_type=learner_type,
        rag_results=rag_results,
    )
    sections = _text_sections(data)
    visual_plan = _clean_visual_plan(data, concept, sections)
    total_visuals = len(visual_plan)

    yield _status(
        "planning_visuals",
        "Planning meaningful visual placements for each major paragraph...",
        current=0,
        total=total_visuals,
    )
    yield {
        "event": "title",
        "data": {
            "title": str(data.get("title") or concept),
            "note_type": str(data.get("note_type") or "conceptual_explainer"),
        },
    }

    by_index: Dict[int, List[Dict[str, Any]]] = {}
    for slot in visual_plan:
        by_index.setdefault(slot["after_section_index"], []).append(slot)

    visual_count = 0
    for index, section in enumerate(sections):
        yield {
            "event": "section",
            "data": section.model_dump(),
        }
        for slot in by_index.get(index, []):
            visual_count += 1
            visual = None
            if slot["visual_type"] == "searched_image":
                yield _status(
                    "searching_images",
                    f"Searching Wikimedia Commons for {slot['query']}...",
                    detail=slot["query"],
                    current=visual_count,
                    total=total_visuals,
                )
                visual = _searched_image_section(slot)
                if visual is None:
                    yield _status(
                        "generating_diagram",
                        "No suitable image found, generating a diagram instead...",
                        detail=slot["query"],
                        current=visual_count,
                        total=total_visuals,
                    )
            else:
                yield _status(
                    "generating_diagram",
                    f"Generating diagram {visual_count} of {total_visuals}: {slot['query']}...",
                    detail=slot["query"],
                    current=visual_count,
                    total=total_visuals,
                )

            if visual is None:
                nearby_text = f"{section.heading or concept}\n{section.body}"
                visual = _diagram_section(slot, nearby_text)
            if visual is not None:
                yield _status(
                    "placing_visual",
                    f"Placing visual after {section.heading or 'the introduction'}...",
                    detail=slot["placement_reason"],
                    current=visual_count,
                    total=total_visuals,
                )
                yield {
                    "event": "section",
                    "data": visual.model_dump(),
                }

    yield _status(
        "finalizing_references",
        "Finalizing citations and source references...",
    )
    references = [
        ComposerReference(num=_safe_num(ref.get("num")), excerpt=str(ref.get("excerpt", ""))[:120])
        for ref in data.get("references", [])
        if _safe_num(ref.get("num")) > 0
    ]
    yield {"event": "references_raw", "data": references}
    yield _status("complete", "Visual note is ready.")
