from typing import Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


Intent = Literal[
    "sequential",
    "radial",
    "cyclic",
    "comparison",
    "hierarchical",
    "timeline",
    "pyramid",
]


class VisualNodePlan(BaseModel):
    id: str
    label: str
    color: str = "#6366f1"
    role: Optional[str] = None
    icon: Optional[str] = None
    type: Optional[str] = None


class VisualEdgePlan(BaseModel):
    source: str
    target: str
    label: Optional[str] = None
    style: Optional[str] = None


class VisualPlan(BaseModel):
    title: str = "Concept Map"
    intent: Optional[Intent] = None
    theme: str = "developer-dark"
    nodes: List[VisualNodePlan] = Field(default_factory=list)
    edges: List[VisualEdgePlan] = Field(default_factory=list)


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
