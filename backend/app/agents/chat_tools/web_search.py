from typing import Dict, List

import requests

from app.core.config import settings
from app.services.llm_service import llm_service


def _brave_search(query: str) -> List[Dict[str, str]]:
    if not settings.BRAVE_SEARCH_API_KEY:
        return []

    response = requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": settings.BRAVE_SEARCH_API_KEY,
        },
        params={"q": query, "count": 5},
        timeout=settings.WEB_SEARCH_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    return [
        {
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("description", ""),
        }
        for item in data.get("web", {}).get("results", [])
    ]


def search_web(*, query: str, history: List[Dict[str, str]]) -> Dict[str, object]:
    results = _brave_search(query)
    if not results:
        return {
            "response": (
                "Web search is wired into the agent layer, but no search provider is configured yet. "
                "Set BRAVE_SEARCH_API_KEY to enable live web results."
            ),
            "blocks": [
                {
                    "type": "tool_result",
                    "title": "Web search unavailable",
                    "data": {"query": query, "provider": "Brave Search", "configured": False},
                }
            ],
            "quiz": None,
            "feedback": None,
            "action": {
                "tool": "web_search",
                "input": query,
                "output": {"results": 0, "configured": False},
            },
        }

    search_context = "\n".join(
        f"[{idx + 1}] {item['title']}\nURL: {item['url']}\nSnippet: {item['snippet']}"
        for idx, item in enumerate(results)
    )
    response = llm_service._call_llm(
        system_prompt=(
            "You are CognifyAI, a study assistant summarizing web search results. "
            "Answer the user clearly and cite result numbers like [1]."
        ),
        user_prompt=f"USER REQUEST:\n{query}\n\nWEB RESULTS:\n{search_context}",
        temperature=0.4,
        max_tokens=900,
        history=history,
    )
    return {
        "response": response,
        "blocks": [
            {"type": "text", "text": response},
            {"type": "web_results", "results": results},
        ],
        "quiz": None,
        "feedback": None,
        "action": {
            "tool": "web_search",
            "input": query,
            "output": {"results": len(results), "configured": True},
        },
    }
