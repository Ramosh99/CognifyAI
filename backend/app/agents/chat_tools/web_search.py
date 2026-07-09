from typing import Dict, List, Tuple

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

from app.agents.chat_tools.query_planner import plan_query
from app.services.llm_service import llm_service


def _duckduckgo_search(search_query: str) -> Tuple[List[Dict[str, str]], str | None]:
    if DDGS is None:
        return [], "duckduckgo_search is not installed. Run pip install -r requirements.txt."

    try:
        with DDGS() as ddgs:
            raw_results = ddgs.text(search_query, max_results=5)
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


def search_web(*, query: str, history: List[Dict[str, str]]) -> Dict[str, object]:
    provider = "DuckDuckGo"
    planned = plan_query(
        target="web_search",
        message=query,
        history=history,
        topic=None,
    )
    search_query = planned["query"]
    results, error = _duckduckgo_search(search_query)
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
                        "search_query": search_query,
                        "query_reason": planned["reason"],
                        "provider": "DuckDuckGo",
                        "configured": DDGS is not None,
                        "error": error,
                    },
                }
            ],
            "quiz": None,
            "feedback": None,
            "action": {
                "tool": "web_search",
                "input": query,
                "output": {
                    "results": 0,
                    "provider": "DuckDuckGo",
                    "search_query": search_query,
                    "query_reason": planned["reason"],
                    "error": error,
                },
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
        user_prompt=(
            f"USER REQUEST:\n{query}\n\n"
            f"SEARCH QUERY USED:\n{search_query}\n\n"
            f"WEB RESULTS:\n{search_context}"
        ),
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
            "output": {
                "results": len(results),
                "provider": provider,
                "search_query": search_query,
                "query_reason": planned["reason"],
            },
        },
    }
