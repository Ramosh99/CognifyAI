import re
from typing import Dict, List, Tuple

import requests
try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

from app.core.config import settings
from app.services.llm_service import llm_service


def _clean_query(query: str) -> str:
    clean = query.strip()
    clean = re.sub(r"^(can you|could you|please|search|find|look up|google)\s+", "", clean, flags=re.I)
    clean = re.sub(r"^(find|search|look up)\s+(anything\s+)?(about|on|for)\s+", "", clean, flags=re.I)
    clean = re.sub(r"\s+", " ", clean)
    return clean[:400] or query.strip()[:400]


def _duckduckgo_search(query: str) -> Tuple[List[Dict[str, str]], str | None]:
    if DDGS is None:
        return [], "duckduckgo_search is not installed. Run pip install -r requirements.txt."

    try:
        with DDGS() as ddgs:
            raw_results = ddgs.text(_clean_query(query), max_results=5)
            results = [
                {
                    "title": item.get("title", ""),
                    "url": item.get("href", ""),
                    "snippet": item.get("body", ""),
                }
                for item in raw_results
                if item.get("title") and item.get("href")
            ]
    except Exception as exc:
        return [], f"DuckDuckGo search failed: {exc}"

    return results, None


def _brave_search(query: str) -> Tuple[List[Dict[str, str]], str | None]:
    if not settings.BRAVE_SEARCH_API_KEY:
        return [], "BRAVE_SEARCH_API_KEY is not configured."

    try:
        response = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": settings.BRAVE_SEARCH_API_KEY,
            },
            params={
                "q": _clean_query(query),
                "count": 5,
                "country": "us",
                "search_lang": "en",
                "safesearch": "moderate",
            },
            timeout=settings.WEB_SEARCH_TIMEOUT,
        )
    except requests.RequestException as exc:
        return [], f"Search request failed: {exc}"

    if response.status_code >= 400:
        detail = response.text[:500] if response.text else response.reason
        return [], f"Brave Search returned {response.status_code}: {detail}"

    data = response.json()
    return [
        {
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("description", ""),
        }
        for item in data.get("web", {}).get("results", [])
    ], None


def search_web(*, query: str, history: List[Dict[str, str]]) -> Dict[str, object]:
    provider = "DuckDuckGo"
    results, error = _duckduckgo_search(query)
    if not results and settings.BRAVE_SEARCH_API_KEY:
        provider = "Brave Search"
        results, error = _brave_search(query)

    if not results:
        message = (
            f"I could not complete the live web search. {error}"
            if error
            else "I searched the web but did not find matching results."
        )
        return {
            "response": message,
            "blocks": [
                {
                    "type": "tool_result",
                    "title": "Web search unavailable" if error else "No web results",
                    "data": {
                        "query": query,
                        "clean_query": _clean_query(query),
                        "provider": provider,
                        "configured": True,
                        "error": error,
                    },
                }
            ],
            "quiz": None,
            "feedback": None,
            "action": {
                "tool": "web_search",
                "input": query,
                "output": {"results": 0, "provider": provider, "error": error},
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
            "output": {"results": len(results), "provider": provider},
        },
    }
