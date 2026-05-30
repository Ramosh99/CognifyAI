import re
from typing import Any

from pydantic import ValidationError

from app.agents.visual_tools.icon_manifest import hydrate_icon
from app.agents.visual_tools.schemas import VisualPlan


FALLBACK_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#f97316"]
VALID_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
STOPWORDS = {
    "about", "after", "again", "also", "and", "application", "are", "because",
    "before", "being", "between", "can", "clear", "does", "each", "exactly",
    "from", "have", "into", "like", "main", "must", "need", "needs", "showing",
    "that", "the", "their", "then", "there", "these", "this", "through", "user",
    "users", "using", "where", "which", "will", "with", "within", "your",
}


def _title_words(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", text)
    picked: list[str] = []
    seen: set[str] = set()
    for word in words:
        key = word.lower()
        if key in STOPWORDS or key in seen:
            continue
        seen.add(key)
        picked.append(word)
    return picked


def _labelize(words: list[str], start: int, default: str) -> str:
    chunk = words[start : start + 2]
    if not chunk:
        return default
    return " ".join(word.capitalize() for word in chunk)[:28]


def fallback_plan(text: str) -> VisualPlan:
    words = _title_words(text)
    lower = text.lower()
    if any(term in lower for term in (" vs ", " versus ", "compare", "difference")):
        intent = "comparison"
        nodes = [
            {"id": "n1", "label": _labelize(words, 0, "Option A"), "type": "concept", "icon": "concept", "role": "left", "color": "#06b6d4"},
            {"id": "n2", "label": _labelize(words, 2, "Trait A"), "type": "process", "icon": "process", "role": "left", "color": "#06b6d4"},
            {"id": "n3", "label": _labelize(words, 4, "Option B"), "type": "concept", "icon": "concept", "role": "right", "color": "#f59e0b"},
            {"id": "n4", "label": _labelize(words, 6, "Trait B"), "type": "process", "icon": "process", "role": "right", "color": "#f59e0b"},
        ]
        edges = []
    elif any(term in lower for term in ("cycle", "loop", "repeat", "feedback")):
        intent = "cyclic"
        nodes = [
            {"id": f"n{i + 1}", "label": _labelize(words, i * 2, default), "type": "process", "icon": "process", "color": FALLBACK_COLORS[i % len(FALLBACK_COLORS)]}
            for i, default in enumerate(("Trigger", "Action", "Feedback", "Adjustment"))
        ]
        edges = [
            {"source": "n1", "target": "n2", "label": "starts"},
            {"source": "n2", "target": "n3", "label": "creates"},
            {"source": "n3", "target": "n4", "label": "guides"},
            {"source": "n4", "target": "n1", "label": "repeats"},
        ]
    elif any(term in lower for term in ("pipeline", "workflow", "process", "flow", "stage", "step")):
        intent = "sequential"
        defaults = ("Input", "Workspace", "Processing", "Preview", "Output")
        nodes = [
            {"id": f"n{i + 1}", "label": _labelize(words, i * 2, default), "type": "process", "icon": "process", "color": FALLBACK_COLORS[i % len(FALLBACK_COLORS)]}
            for i, default in enumerate(defaults)
        ]
        edges = [
            {"source": f"n{i + 1}", "target": f"n{i + 2}", "label": label}
            for i, label in enumerate(("feeds", "builds", "checks", "delivers"))
        ]
    else:
        intent = "radial"
        defaults = ("Core Idea", "Key Part", "Cause", "Effect", "Example")
        nodes = [
            {"id": f"n{i + 1}", "label": _labelize(words, i * 2, default), "type": "concept", "icon": "concept", "color": FALLBACK_COLORS[i % len(FALLBACK_COLORS)]}
            for i, default in enumerate(defaults)
        ]
        edges = [
            {"source": "n1", "target": f"n{i}", "label": "relates"}
            for i in range(2, len(nodes) + 1)
        ]

    return VisualPlan(
        title=" ".join(word.capitalize() for word in words[:4]) or "Concept Map",
        intent=intent,
        nodes=nodes,
        edges=edges,
    )


def validate_plan(raw: Any, fallback_text: str) -> VisualPlan:
    try:
        plan = VisualPlan.model_validate(raw)
    except (ValidationError, TypeError, ValueError):
        return fallback_plan(fallback_text)

    seen: set[str] = set()
    cleaned_nodes = []
    for idx, node in enumerate(plan.nodes[:10]):
        node.id = re.sub(r"[^a-zA-Z0-9_-]", "_", node.id or f"n{idx + 1}")
        if node.id in seen:
            node.id = f"{node.id}_{idx}"
        seen.add(node.id)
        node.label = (node.label or f"Node {idx + 1}")[:60]
        node.color = node.color if VALID_HEX.match(node.color) else FALLBACK_COLORS[idx % len(FALLBACK_COLORS)]
        if hydrate_icon(node.icon) is None:
            node.icon = node.type if hydrate_icon(node.type) else "concept"
        cleaned_nodes.append(node)

    if not cleaned_nodes:
        return fallback_plan(fallback_text)

    valid_ids = {node.id for node in cleaned_nodes}
    cleaned_edges = [
        edge
        for edge in plan.edges[:30]
        if edge.source in valid_ids and edge.target in valid_ids and edge.source != edge.target
    ]

    plan.nodes = cleaned_nodes
    plan.edges = cleaned_edges
    return plan
