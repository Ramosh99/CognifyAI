from app.agents.visual_tools.layout import layout_plan
from app.agents.visual_tools.planner import plan_diagram
from app.agents.visual_tools.schemas import DiagramData
from app.agents.visual_tools.validator import fallback_plan, validate_plan


def build_diagram(text: str) -> DiagramData:
    try:
        raw_plan = plan_diagram(text)
    except Exception:
        raw_plan = fallback_plan(text).model_dump()
    plan = validate_plan(raw_plan, text)
    return layout_plan(plan)
