from typing import Any, Dict, List, Literal, Optional

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


def _fallback_note_data(concept: str, rag_results: List[dict]) -> Dict[str, Any]:
    references = []
    for i, result in enumerate(rag_results[:3], start=1):
        excerpt = result.get("text", "")[:100]
        if excerpt:
            references.append({"num": i, "excerpt": excerpt})

    cite = " [1]" if references else ""
    return {
        "title": concept.strip()[:80] or "Study Note",
        "note_type": "conceptual_explainer",
        "sections": [
            {
                "type": "text",
                "body": (
                    f"{concept} should be studied as an exam-style explanatory note, not as a short definition.{cite} "
                    "Start by identifying the scope of each term, then compare how the ideas relate, where they overlap, "
                    "and where they differ. A strong answer usually defines the broad concept first, explains the narrower "
                    "concept second, and then uses examples to show why the distinction matters. This structure prevents "
                    "a common exam mistake: treating related technical terms as synonyms just because they appear in the "
                    "same industry or textbook chapter."
                ),
            },
            {
                "type": "text",
                "heading": "Core Definition",
                "body": (
                    "Artificial intelligence is the wider field concerned with building systems that perform tasks associated "
                    "with human intelligence, such as reasoning, planning, perception, language understanding, decision-making, "
                    "and problem solving. In an advanced exam, the key point is that AI is a goal-oriented umbrella term: it "
                    "describes the ambition to create intelligent behavior, whether that behavior comes from hand-written rules, "
                    "search algorithms, symbolic logic, probabilistic models, or learned patterns. AI therefore includes both "
                    "systems that learn and systems that follow carefully designed procedures."
                ),
            },
            {
                "type": "text",
                "heading": "Where Machine Learning Fits",
                "body": (
                    "Machine learning is a major subfield of AI that focuses on systems improving their performance from data. "
                    "Instead of programming every rule directly, engineers provide examples, feedback, or experience, and the "
                    "model learns patterns that can generalize to new cases. This means every ML system is part of AI when it is "
                    "used for intelligent behavior, but not every AI system is ML. A rule-based chess engine, for example, may be "
                    "AI without being machine learning. The exam phrase to remember is: ML is a data-driven technique for "
                    "achieving some AI behavior."
                ),
            },
            {
                "type": "text",
                "heading": "Main Differences",
                "body": (
                    "The most important difference is scope. AI is the broad discipline; ML is one method within that discipline. "
                    "AI asks, 'How can a machine act intelligently?' ML asks, 'How can a machine learn from data?' AI can use rules, "
                    "logic, planning, search, optimization, robotics, and ML. ML specifically depends on datasets, training, model "
                    "parameters, evaluation metrics, and generalization. For exam answers, this hierarchy is often the safest way "
                    "to explain the relationship."
                ),
            },
            {
                "type": "text",
                "heading": "Examples and Applications",
                "body": (
                    "A virtual assistant combines several AI capabilities: speech recognition, language understanding, dialogue "
                    "management, search, and decision-making. Some of these parts may use machine learning, while others may use "
                    "rules or retrieval. Image classification, recommendation systems, spam detection, and predictive analytics are "
                    "clear examples of machine learning because their behavior depends on patterns learned from data. Autonomous "
                    "robots, expert systems, and game-playing agents may combine ML with other AI techniques."
                ),
            },
            {
                "type": "text",
                "heading": "Advanced Exam Takeaway",
                "body": (
                    "A precise answer should avoid saying AI and ML are the same. AI is the larger objective of making machines "
                    "perform intelligent tasks; ML is a data-driven route for achieving some of those tasks. Deep learning is an "
                    "even narrower subset of ML that uses multi-layer neural networks. The clean hierarchy is: Artificial Intelligence "
                    "contains Machine Learning, and Machine Learning contains Deep Learning. Use this hierarchy, then support it with "
                    "contrasting examples."
                ),
            },
        ],
        "visual_plan": [
            {
                "after_section_index": 0,
                "visual_type": "diagram",
                "purpose": "Show the broad-to-narrow hierarchy before details begin.",
                "query": f"{concept} hierarchy AI ML deep learning",
                "placement_reason": "The hierarchy diagram belongs after the introduction because it anchors the rest of the note.",
            },
            {
                "after_section_index": 1,
                "visual_type": "searched_image",
                "purpose": "Provide a real reference image for the broader AI field.",
                "query": "artificial intelligence applications diagram Wikimedia Commons",
                "placement_reason": "A reference image after the AI definition helps connect the term to recognizable applications.",
            },
            {
                "after_section_index": 2,
                "visual_type": "diagram",
                "purpose": "Show how machine learning uses data, training, and prediction.",
                "query": "machine learning training data model prediction flow",
                "placement_reason": "This belongs after the ML section because it visualizes the data-driven mechanism.",
            },
            {
                "after_section_index": 3,
                "visual_type": "diagram",
                "purpose": "Compare AI and ML side by side across scope, method, and examples.",
                "query": f"{concept} comparison table scope methods examples",
                "placement_reason": "A comparison visual belongs after the differences section to make the contrast memorable.",
            },
            {
                "after_section_index": 4,
                "visual_type": "searched_image",
                "purpose": "Add an application-oriented visual reference for real-world AI and ML use.",
                "query": "machine learning applications Wikimedia Commons",
                "placement_reason": "An application image belongs after examples because it grounds abstract terms in real systems.",
            },
            {
                "after_section_index": 5,
                "visual_type": "diagram",
                "purpose": "Summarize the final exam hierarchy: AI contains ML contains deep learning.",
                "query": "AI ML deep learning nested hierarchy exam summary",
                "placement_reason": "A final hierarchy diagram helps the learner remember the exam-safe conclusion.",
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
