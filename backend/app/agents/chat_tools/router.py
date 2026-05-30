from typing import Dict, List, Literal, Optional, TypedDict

from app.services.llm_service import llm_service


Intent = Literal[
    "normal",
    "study",
    "quiz",
    "analyze",
    "visual",
    "web_search",
    "mcp_action",
    "multi_tool",
]


class RouteResult(TypedDict):
    intent: Intent
    reason: str


ROUTER_SYSTEM_PROMPT = """
You are the CognifyAI chat orchestrator.
Classify the user's latest message so the app can route it to exactly one agent.

Available intents:
- normal: greetings, app-help questions, small talk, or messages that do not need a learning workflow.
- study: explanations, summaries, definitions, comparisons, tutoring, or general learning questions.
- quiz: requests to generate quizzes, MCQs, tests, practice questions, or "test me" style prompts.
- analyze: requests to analyze a wrong answer, misconception, mistake, or why an answer is incorrect.
- visual: requests for diagrams, visual explanations, mind maps, flowcharts, concept maps, or visual structure.
- web_search: requests to search the web, find current/latest information, look up anything outside uploaded notes, or find public YouTube videos/resources.
- mcp_action: requests to read or modify connected private apps/tools such as calendar, Drive, Docs, email, or other MCP connectors.
- multi_tool: requests that clearly require more than one tool, such as finding web/YouTube material and then making a study plan.

Routing rules:
- Pick exactly one intent.
- If a topic is supplied, prefer a learning intent over normal unless the latest message is clearly small talk.
- If wrong_answer or correct_answer is supplied, prefer analyze.
- If the message asks for both explanation and quiz, choose quiz when assessment/practice is the final requested action.
- If the message asks for visual output or diagrammatic explanation, choose visual.
- If the user asks to find YouTube videos, choose web_search unless they ask to use a private YouTube account action.
- When unsure between normal and study, choose study if the user appears to ask about a subject or concept.

Output ONLY valid JSON with this schema:
{"intent":"normal|study|quiz|analyze|visual|web_search|mcp_action|multi_tool","reason":"short reason"}
"""


def _fallback_route(
    *,
    message: str,
    topic: Optional[str],
    wrong_answer: Optional[str],
    correct_answer: Optional[str],
) -> RouteResult:
    text = message.lower().strip()
    if wrong_answer or correct_answer:
        return {"intent": "analyze", "reason": "answer analysis fields were provided"}
    if text in {"hi", "hello", "hey"}:
        return {"intent": "normal", "reason": "short greeting"}
    if any(term in text for term in ("quiz", "mcq", "test me", "practice question")):
        return {"intent": "quiz", "reason": "message asks for practice questions"}
    if any(term in text for term in ("diagram", "visual", "mind map", "flowchart")):
        return {"intent": "visual", "reason": "message asks for visual output"}
    if any(term in text for term in ("search", "google", "web", "latest", "current", "youtube", "video")):
        return {"intent": "web_search", "reason": "message asks for web lookup"}
    if any(term in text for term in ("calendar", "google drive", "docs", "gmail")):
        return {"intent": "mcp_action", "reason": "message mentions a connected app"}
    if topic or len(text.split()) >= 5:
        return {"intent": "study", "reason": "message appears to be a study question"}
    return {"intent": "normal", "reason": "fallback normal route"}


def route_intent(
    *,
    message: str,
    history: List[Dict[str, str]],
    topic: Optional[str],
    wrong_answer: Optional[str],
    correct_answer: Optional[str],
) -> RouteResult:
    history_preview = "\n".join(
        f"{turn.get('role', 'user')}: {turn.get('content', '')[:160]}"
        for turn in history[-4:]
    )
    user_prompt = f"""LATEST MESSAGE:
{message}

TOPIC:
{topic or ""}

WRONG ANSWER PROVIDED:
{"yes" if wrong_answer else "no"}

CORRECT ANSWER PROVIDED:
{"yes" if correct_answer else "no"}

RECENT HISTORY:
{history_preview}

Return the route JSON now."""

    try:
        raw = llm_service._call_llm(
            system_prompt=ROUTER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.0,
            max_tokens=120,
        )
        data = llm_service.parse_json_response(raw)
        intent = data.get("intent")
        if intent in {
            "normal",
            "study",
            "quiz",
            "analyze",
            "visual",
            "web_search",
            "mcp_action",
            "multi_tool",
        }:
            return {
                "intent": intent,
                "reason": str(data.get("reason") or "model route"),
            }
    except Exception:
        pass

    return _fallback_route(
        message=message,
        topic=topic,
        wrong_answer=wrong_answer,
        correct_answer=correct_answer,
    )
