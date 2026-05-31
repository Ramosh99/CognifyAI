import re
from typing import Dict, List, Literal, Optional, TypedDict

from app.services.llm_service import llm_service


QueryTarget = Literal["web_search", "image_search", "document_search", "quiz", "visual"]


class PlannedQuery(TypedDict):
    query: str
    reason: str


QUERY_PLANNER_SYSTEM_PROMPT = """
You are CognifyAI's query planner inside the chat orchestrator.
Rewrite the user's latest message into the best query for the selected tool.

Rules:
- Output ONLY valid JSON: {"query":"...","reason":"..."}.
- Never pass through conversational wording such as "can you", "find", "search", "about this".
- Resolve pronouns and vague references like "this", "it", "that topic", "these results" from recent chat history.
- If the latest message asks for YouTube/videos, produce a web query containing site:youtube.com.
- For image_search, produce visual search keywords for the topic being learned.
- For document_search, produce a concise semantic retrieval query, not a web-style query.
- For web_search, include useful search keywords and constraints.
- If there is no resolvable topic, use the latest meaningful subject from the conversation.
- Keep query under 14 words unless a named concept needs more words.
"""


def _history_preview(history: List[Dict[str, str]]) -> str:
    return "\n".join(
        f"{turn.get('role', 'user')}: {turn.get('content', '')[:500]}"
        for turn in history[-6:]
    )


def _clean_message(message: str) -> str:
    clean = message.strip()
    clean = re.sub(r"\b(yt|youtube)\b", "youtube", clean, flags=re.I)
    clean = re.sub(r"^(can you|could you|please)\s+", "", clean, flags=re.I)
    clean = re.sub(r"^(find|search|look up|google)\s+(anything\s+)?(about|on|for)?\s*", "", clean, flags=re.I)
    clean = re.sub(r"\s+", " ", clean)
    return clean[:400] or message.strip()[:400]


def _meaningful_history_subject(history: List[Dict[str, str]]) -> str:
    for turn in reversed(history):
        content = _clean_message(turn.get("content", ""))
        if not content:
            continue
        lines = [
            line.strip()
            for line in content.splitlines()
            if line.strip()
            and not line.lower().startswith(("web result", "source", "diagram:", "quiz "))
        ]
        candidate = " ".join(lines[:2]).strip() or content
        if "." in candidate:
            candidate = candidate.split(".", 1)[0].strip()
        if len(candidate.split()) >= 3 and not re.search(r"\b(this|it|that|these)\b", candidate, flags=re.I):
            return candidate[:120]
    return ""


def _fallback_query(
    *,
    target: QueryTarget,
    message: str,
    history: List[Dict[str, str]],
    topic: Optional[str],
) -> PlannedQuery:
    query = topic or _clean_message(message)
    if re.search(r"\b(this|it|that|these)\b", query, flags=re.I):
        query = _meaningful_history_subject(history) or query
    if target == "web_search" and re.search(r"\b(youtube|video|videos)\b", message, flags=re.I):
        query = re.sub(r"\b(any|youtube|yt|video|videos|about|for|on|this)\b", "", query, flags=re.I).strip()
        query = f"site:youtube.com {query}".strip()
    return {"query": query, "reason": "fallback query planning"}


def plan_query(
    *,
    target: QueryTarget,
    message: str,
    history: List[Dict[str, str]],
    topic: Optional[str] = None,
) -> PlannedQuery:
    try:
        raw = llm_service._call_llm(
            system_prompt=QUERY_PLANNER_SYSTEM_PROMPT,
            user_prompt=(
                f"TARGET TOOL:\n{target}\n\n"
                f"LATEST USER MESSAGE:\n{message}\n\n"
                f"OPTIONAL TOPIC FILTER:\n{topic or ''}\n\n"
                f"RECENT CHAT HISTORY:\n{_history_preview(history)}\n\n"
                "Return the planned query JSON now."
            ),
            temperature=0.0,
            max_tokens=120,
        )
        data = llm_service.parse_json_response(raw)
        query = str(data.get("query") or "").strip()
        if query:
            return {
                "query": query[:400],
                "reason": str(data.get("reason") or "model query planning"),
            }
    except Exception:
        pass

    return _fallback_query(
        target=target,
        message=message,
        history=history,
        topic=topic,
    )
