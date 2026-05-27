"""
Layout solver: takes a semantic graph (nodes + edges + intent) from the LLM
and returns a fully laid-out diagram with per-node geometry and edge polylines.

Separates semantics (LLM) from geometry (this module). The LLM never picks
coordinates or even a rigid template — the topology + intent picks the layout.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple

import networkx as nx


# ── Input shape (from LLM) ─────────────────────────────────────────────────────

@dataclass
class InputNode:
    id: str
    label: str
    color: str = "#6366f1"
    role: Optional[str] = None   # e.g. "left"/"right" for comparison, "layer-1" for pyramid


@dataclass
class InputEdge:
    src: str
    dst: str
    label: Optional[str] = None


@dataclass
class GraphPlan:
    title: str
    nodes: List[InputNode]
    edges: List[InputEdge] = field(default_factory=list)
    intent: Optional[str] = None  # sequential|radial|cyclic|comparison|hierarchical|timeline|pyramid


# ── Output shape (to frontend) ─────────────────────────────────────────────────

@dataclass
class LaidOutNode:
    id: str
    label: str
    color: str
    x: float
    y: float
    w: float
    h: float
    shape: Literal["rect", "circle"] = "rect"


@dataclass
class LaidOutEdge:
    src: str
    dst: str
    label: Optional[str]
    points: List[Tuple[float, float]]
    marker: Literal["arrow", "none"] = "arrow"


@dataclass
class LaidOutDiagram:
    title: str
    layout_type: str
    viewbox: Dict[str, float]
    nodes: List[LaidOutNode]
    edges: List[LaidOutEdge]


# ── Tunables ───────────────────────────────────────────────────────────────────

CANVAS_W = 700
CANVAS_H = 410
MARGIN = 40

CHAR_W = 7.0           # px per char at the 11px label font we use
LINE_H = 14
NODE_PAD_X = 20
NODE_PAD_Y = 14
MIN_NODE_W = 96
MIN_NODE_H = 50
MAX_LABEL_LINE = 14    # chars per line before wrapping
MAX_LINES = 3

VALID_INTENTS = {
    "sequential", "radial", "cyclic", "comparison",
    "hierarchical", "timeline", "pyramid",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _wrap_chars(label: str, max_chars: int = MAX_LABEL_LINE) -> List[str]:
    words = label.split()
    lines: List[str] = []
    cur = ""
    for w in words:
        nxt = f"{cur} {w}".strip()
        if len(nxt) > max_chars and cur:
            lines.append(cur)
            cur = w
        else:
            cur = nxt
    if cur:
        lines.append(cur)
    return lines[:MAX_LINES] or [label[:max_chars]]


def measure_label(label: str) -> Tuple[float, float]:
    """(width, height) needed to fit `label` with padding."""
    lines = _wrap_chars(label)
    longest = max((len(l) for l in lines), default=1)
    w = max(MIN_NODE_W, longest * CHAR_W + 2 * NODE_PAD_X)
    h = max(MIN_NODE_H, len(lines) * LINE_H + 2 * NODE_PAD_Y)
    return w, h


def _build_nx(plan: GraphPlan) -> nx.DiGraph:
    g = nx.DiGraph()
    for n in plan.nodes:
        g.add_node(n.id)
    for e in plan.edges:
        if e.src in g.nodes and e.dst in g.nodes and e.src != e.dst:
            g.add_edge(e.src, e.dst)
    return g


# ── Strategy picker ────────────────────────────────────────────────────────────

def pick_strategy(plan: GraphPlan) -> str:
    if plan.intent in VALID_INTENTS:
        return plan.intent

    g = _build_nx(plan)
    n = g.number_of_nodes()

    try:
        nx.find_cycle(g, orientation="original")
        return "cyclic"
    except nx.NetworkXNoCycle:
        pass

    if n >= 3:
        for node in g.nodes:
            if g.in_degree(node) + g.out_degree(node) >= n - 1:
                return "radial"

    if g.number_of_edges() > 0 and nx.is_directed_acyclic_graph(g):
        max_out = max((g.out_degree(node) for node in g.nodes), default=0)
        return "sequential" if max_out <= 1 else "hierarchical"

    text = ((plan.title or "") + " " + " ".join(n.label for n in plan.nodes)).lower()
    if " vs " in text or " versus " in text:
        return "comparison"

    return "radial"


# ── Strategy implementations ───────────────────────────────────────────────────

def _layout_sequential(plan: GraphPlan):
    g = _build_nx(plan)
    try:
        order = list(nx.topological_sort(g))
    except nx.NetworkXUnfeasible:
        order = [n.id for n in plan.nodes]
    # Append any disconnected nodes that topo-sort missed
    for n in plan.nodes:
        if n.id not in order:
            order.append(n.id)

    by_id = {n.id: n for n in plan.nodes}
    sized = [(nid, *measure_label(by_id[nid].label)) for nid in order]
    total_w = sum(w for _, w, _ in sized)
    n = len(sized)
    gap = max(36.0, (CANVAS_W - 2 * MARGIN - total_w) / max(n - 1, 1))
    canvas_w = max(CANVAS_W, int(total_w + (n - 1) * gap + 2 * MARGIN))

    cy = CANVAS_H / 2
    out: List[LaidOutNode] = []
    cx = MARGIN
    for nid, w, h in sized:
        nm = by_id[nid]
        out.append(LaidOutNode(
            id=nid, label=nm.label, color=nm.color,
            x=cx + w / 2, y=cy, w=w, h=h, shape="rect",
        ))
        cx += w + gap
    return out, {"w": float(canvas_w), "h": float(CANVAS_H)}


def _layout_hierarchical(plan: GraphPlan):
    g = _build_nx(plan)
    by_id = {n.id: n for n in plan.nodes}

    roots = [nid for nid in g.nodes if g.in_degree(nid) == 0]
    if not roots:
        roots = [plan.nodes[0].id]

    level: Dict[str, int] = {r: 0 for r in roots}
    frontier = list(roots)
    while frontier:
        nxt = []
        for nid in frontier:
            for child in g.successors(nid):
                lv = level[nid] + 1
                if child not in level or level[child] < lv:
                    level[child] = lv
                    nxt.append(child)
        frontier = nxt

    next_lv = max(level.values(), default=0) + 1
    for nid in g.nodes:
        if nid not in level:
            level[nid] = next_lv

    levels: Dict[int, List[str]] = {}
    for nid, lv in level.items():
        levels.setdefault(lv, []).append(nid)

    n_levels = max(levels.keys()) + 1
    canvas_h = max(CANVAS_H, 130 * n_levels + 60)
    layer_h = (canvas_h - 2 * MARGIN) / max(n_levels, 1)

    out: List[LaidOutNode] = []
    canvas_w = CANVAS_W
    for lv in range(n_levels):
        ids = levels.get(lv, [])
        if not ids:
            continue
        sized = [(nid, *measure_label(by_id[nid].label)) for nid in ids]
        total = sum(w for _, w, _ in sized)
        gap = max(32.0, (canvas_w - 2 * MARGIN - total) / max(len(sized) - 1, 1))
        needed = total + (len(sized) - 1) * gap + 2 * MARGIN
        if needed > canvas_w:
            canvas_w = int(needed)
        cy = MARGIN + lv * layer_h + layer_h / 2
        cx = MARGIN
        for nid, w, h in sized:
            nm = by_id[nid]
            out.append(LaidOutNode(
                id=nid, label=nm.label, color=nm.color,
                x=cx + w / 2, y=cy, w=w, h=h, shape="rect",
            ))
            cx += w + gap
    return out, {"w": float(canvas_w), "h": float(canvas_h)}


def _layout_radial(plan: GraphPlan):
    by_id = {n.id: n for n in plan.nodes}
    g = _build_nx(plan)

    if not plan.nodes:
        return [], {"w": float(CANVAS_W), "h": float(CANVAS_H)}

    hub_id = max(plan.nodes, key=lambda n: g.in_degree(n.id) + g.out_degree(n.id)).id
    spokes = [n.id for n in plan.nodes if n.id != hub_id]

    cx, cy = CANVAS_W / 2, CANVAS_H / 2
    R = min(CANVAS_W, CANVAS_H) * 0.34

    out: List[LaidOutNode] = []
    hub = by_id[hub_id]
    hw, hh = measure_label(hub.label)
    out.append(LaidOutNode(
        id=hub_id, label=hub.label, color=hub.color,
        x=cx, y=cy, w=hw, h=hh, shape="circle",
    ))

    n = max(len(spokes), 1)
    for i, nid in enumerate(spokes):
        nm = by_id[nid]
        a = (i / n) * 2 * math.pi - math.pi / 2
        sw, sh = measure_label(nm.label)
        out.append(LaidOutNode(
            id=nid, label=nm.label, color=nm.color,
            x=cx + R * math.cos(a),
            y=cy + R * math.sin(a),
            w=sw, h=sh, shape="circle",
        ))
    return out, {"w": float(CANVAS_W), "h": float(CANVAS_H)}


def _layout_cyclic(plan: GraphPlan):
    by_id = {n.id: n for n in plan.nodes}
    g = _build_nx(plan)

    try:
        cycle = nx.find_cycle(g, orientation="original")
        order = [u for u, _, _ in cycle]
    except nx.NetworkXNoCycle:
        order = [n.id for n in plan.nodes]
    for n in plan.nodes:
        if n.id not in order:
            order.append(n.id)

    cx, cy = CANVAS_W / 2, CANVAS_H / 2
    R = min(CANVAS_W, CANVAS_H) * 0.32
    n_total = len(order)

    out: List[LaidOutNode] = []
    for i, nid in enumerate(order):
        nm = by_id[nid]
        a = (i / max(n_total, 1)) * 2 * math.pi - math.pi / 2
        w, h = measure_label(nm.label)
        out.append(LaidOutNode(
            id=nid, label=nm.label, color=nm.color,
            x=cx + R * math.cos(a),
            y=cy + R * math.sin(a),
            w=w, h=h, shape="circle",
        ))
    return out, {"w": float(CANVAS_W), "h": float(CANVAS_H)}


def _layout_comparison(plan: GraphPlan):
    lefts: List[InputNode] = []
    rights: List[InputNode] = []
    for n in plan.nodes:
        if n.role == "right":
            rights.append(n)
        elif n.role == "left":
            lefts.append(n)
    if not lefts and not rights:
        half = (len(plan.nodes) + 1) // 2
        lefts = plan.nodes[:half]
        rights = plan.nodes[half:]

    rows = max(len(lefts), len(rights), 1)
    canvas_h = max(CANVAS_H, 90 + 80 * rows + 40)
    col_w = (CANVAS_W - 3 * MARGIN) / 2

    def place(col_nodes: List[InputNode], col_cx: float):
        items: List[LaidOutNode] = []
        for i, n in enumerate(col_nodes):
            w, h = measure_label(n.label)
            w = min(w, col_w - 16)
            items.append(LaidOutNode(
                id=n.id, label=n.label, color=n.color,
                x=col_cx, y=90 + i * 80, w=max(w, MIN_NODE_W), h=h, shape="rect",
            ))
        return items

    out: List[LaidOutNode] = []
    out.extend(place(lefts, MARGIN + col_w / 2))
    out.extend(place(rights, 2 * MARGIN + col_w + col_w / 2))
    return out, {"w": float(CANVAS_W), "h": float(canvas_h)}


def _layout_timeline(plan: GraphPlan):
    n_nodes = max(len(plan.nodes), 1)
    canvas_w = max(CANVAS_W, 150 * n_nodes + 2 * MARGIN)
    canvas_h = 290
    cy = canvas_h / 2
    step = (canvas_w - 2 * MARGIN) / max(n_nodes - 1, 1)

    out: List[LaidOutNode] = []
    for i, n in enumerate(plan.nodes):
        w, h = measure_label(n.label)
        out.append(LaidOutNode(
            id=n.id, label=n.label, color=n.color,
            x=MARGIN + i * step,
            y=cy - 70 if i % 2 == 0 else cy + 70,
            w=w, h=h, shape="rect",
        ))
    return out, {"w": float(canvas_w), "h": float(canvas_h)}


def _layout_pyramid(plan: GraphPlan):
    layers: Dict[int, List[InputNode]] = {}
    for i, n in enumerate(plan.nodes):
        lv = i
        if n.role and n.role.startswith("layer-"):
            try:
                lv = int(n.role.split("-", 1)[1])
            except (ValueError, IndexError):
                pass
        layers.setdefault(lv, []).append(n)

    sorted_layers = [items for _, items in sorted(layers.items())]
    n_layers = max(len(sorted_layers), 1)
    canvas_h = max(CANVAS_H, 90 * n_layers + 60)
    layer_h = (canvas_h - 2 * MARGIN) / n_layers

    out: List[LaidOutNode] = []
    for idx, items in enumerate(sorted_layers):
        cy = MARGIN + idx * layer_h + layer_h / 2
        frac = (idx + 1) / n_layers
        band_w = max(180.0, (CANVAS_W - 2 * MARGIN) * frac)
        per = band_w / max(len(items), 1)
        x0 = (CANVAS_W - band_w) / 2
        for j, nm in enumerate(items):
            w, h = measure_label(nm.label)
            w = min(w, per - 14)
            out.append(LaidOutNode(
                id=nm.id, label=nm.label, color=nm.color,
                x=x0 + per * j + per / 2,
                y=cy, w=max(w, MIN_NODE_W), h=h, shape="rect",
            ))
    return out, {"w": float(CANVAS_W), "h": float(canvas_h)}


STRATEGIES = {
    "sequential":   _layout_sequential,
    "hierarchical": _layout_hierarchical,
    "radial":       _layout_radial,
    "cyclic":       _layout_cyclic,
    "comparison":   _layout_comparison,
    "timeline":     _layout_timeline,
    "pyramid":      _layout_pyramid,
}


# ── Edge routing ───────────────────────────────────────────────────────────────

def _clip_to_rect(cx: float, cy: float, w: float, h: float, tx: float, ty: float) -> Tuple[float, float]:
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy
    hw, hh = w / 2, h / 2
    sx = hw / abs(dx) if dx else math.inf
    sy = hh / abs(dy) if dy else math.inf
    s = min(sx, sy)
    return cx + dx * s, cy + dy * s


def _clip_to_circle(cx: float, cy: float, r: float, tx: float, ty: float) -> Tuple[float, float]:
    dx, dy = tx - cx, ty - cy
    d = math.hypot(dx, dy) or 1.0
    return cx + dx * r / d, cy + dy * r / d


def _clip(node: LaidOutNode, target_x: float, target_y: float) -> Tuple[float, float]:
    if node.shape == "circle":
        return _clip_to_circle(node.x, node.y, max(node.w, node.h) / 2, target_x, target_y)
    return _clip_to_rect(node.x, node.y, node.w, node.h, target_x, target_y)


def route_edges(
    nodes: List[LaidOutNode],
    edges: List[InputEdge],
    strategy: str,
) -> List[LaidOutEdge]:
    by_id = {n.id: n for n in nodes}
    if not nodes:
        return []
    centroid_x = sum(n.x for n in nodes) / len(nodes)
    centroid_y = sum(n.y for n in nodes) / len(nodes)

    out: List[LaidOutEdge] = []
    for e in edges:
        a = by_id.get(e.src)
        b = by_id.get(e.dst)
        if a is None or b is None or a.id == b.id:
            continue

        p1 = _clip(a, b.x, b.y)
        p2 = _clip(b, a.x, a.y)

        if strategy == "cyclic":
            mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
            ox, oy = mx - centroid_x, my - centroid_y
            d = math.hypot(ox, oy) or 1.0
            mx += ox / d * 30
            my += oy / d * 30
            points = [p1, (mx, my), p2]
        else:
            points = [p1, p2]

        out.append(LaidOutEdge(
            src=e.src, dst=e.dst, label=e.label,
            points=points, marker="arrow",
        ))
    return out


# ── Entry point ────────────────────────────────────────────────────────────────

def solve(plan: GraphPlan) -> LaidOutDiagram:
    if not plan.nodes:
        return LaidOutDiagram(
            title=plan.title or "",
            layout_type="radial",
            viewbox={"w": float(CANVAS_W), "h": float(CANVAS_H)},
            nodes=[], edges=[],
        )

    strategy = pick_strategy(plan)
    layout_fn = STRATEGIES.get(strategy, _layout_radial)
    nodes, viewbox = layout_fn(plan)
    laid_edges = route_edges(nodes, plan.edges, strategy)

    return LaidOutDiagram(
        title=plan.title or "",
        layout_type=strategy,
        viewbox=viewbox,
        nodes=nodes,
        edges=laid_edges,
    )
