from app.agents.visual_tools.icon_manifest import allowed_icon_tokens
from app.services.llm_service import llm_service


VISUAL_PLANNER_SYSTEM_PROMPT = """
You are CognifyAI's diagram-as-code planner.
Convert the user's text into a semantic diagram plan. Do not choose coordinates.

Output ONLY valid JSON with this shape:
{
  "title": "2-5 word title",
  "intent": "sequential|radial|cyclic|comparison|hierarchical|timeline|pyramid",
  "theme": "developer-dark",
  "nodes": [
    {"id": "n1", "label": "short label", "type": "state|event|process|decision|concept", "icon": "allowed-icon-token", "color": "#06b6d4", "role": "optional"}
  ],
  "edges": [
    {"source": "n1", "target": "n2", "label": "short verb", "style": "normal|async|secure|transition"}
  ]
}

Rules:
- 3 to 8 nodes.
- Node ids must be unique and referenced by edges.
- Use only allowed icon tokens from the user prompt. If unsure, use "concept".
- Never output markdown or prose.
"""


def plan_diagram(text: str) -> dict:
    prompt = f"""TEXT TO VISUALIZE:
{text[:1200]}

ALLOWED ICON TOKENS:
{", ".join(allowed_icon_tokens())}

Return the diagram plan JSON now."""
    raw = llm_service._call_llm(
        system_prompt=VISUAL_PLANNER_SYSTEM_PROMPT,
        user_prompt=prompt,
        temperature=0.25,
        max_tokens=900,
    )
    return llm_service.parse_json_response(raw)
