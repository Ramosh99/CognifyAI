from typing import Dict, List, Tuple

import requests

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

from app.agents.chat_tools.query_planner import plan_query


def _duckduckgo_image_search(search_query: str) -> Tuple[List[Dict[str, str]], str | None]:
    if DDGS is None:
        return [], "duckduckgo_search is not installed. Run pip install -r requirements.txt."

    try:
        with DDGS() as ddgs:
            raw_results = ddgs.images(
                search_query,
                max_results=8,
                safesearch="moderate",
            )
            results = [
                {
                    "title": item.get("title", ""),
                    "image": item.get("image", ""),
                    "thumbnail": item.get("thumbnail", "") or item.get("image", ""),
                    "url": item.get("url", ""),
                    "source": item.get("source", ""),
                }
                for item in raw_results
                if item.get("title") and item.get("image")
            ]
    except Exception as exc:
        return [], f"DuckDuckGo image search failed: {exc}"

    return results, None


def _wikimedia_image_search(search_query: str) -> Tuple[List[Dict[str, str]], str | None]:
    try:
        response = requests.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action": "query",
                "format": "json",
                "generator": "search",
                "gsrsearch": search_query,
                "gsrnamespace": 6,
                "gsrlimit": 8,
                "prop": "imageinfo",
                "iiprop": "url|mime|extmetadata",
                "iiurlwidth": 420,
                "origin": "*",
            },
            headers={
                "User-Agent": "CognifyAI/1.0 educational image search",
            },
            timeout=10,
        )
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", {})
        results = []
        for page in pages.values():
            image_info = (page.get("imageinfo") or [{}])[0]
            mime = image_info.get("mime", "")
            image_url = image_info.get("url", "")
            if not image_url or not mime.startswith("image/"):
                continue
            title = str(page.get("title", "")).replace("File:", "").strip()
            metadata = image_info.get("extmetadata") or {}
            source = (metadata.get("Artist") or {}).get("value") or "Wikimedia Commons"
            results.append(
                {
                    "title": title,
                    "image": image_url,
                    "thumbnail": image_info.get("thumburl") or image_url,
                    "url": image_info.get("descriptionurl") or image_url,
                    "source": source,
                }
            )
        return results, None
    except Exception as exc:
        return [], f"Wikimedia Commons image search failed: {exc}"


def search_images(*, query: str, history: List[Dict[str, str]], topic: str | None = None) -> Dict[str, object]:
    provider = "DuckDuckGo"
    planned = plan_query(
        target="image_search",
        message=query,
        history=history,
        topic=topic,
    )
    search_query = planned["query"]
    results, error = _duckduckgo_image_search(search_query)
    if not results:
        fallback_results, fallback_error = _wikimedia_image_search(search_query)
        if fallback_results:
            results = fallback_results
            provider = "Wikimedia Commons"
            error = None
        elif fallback_error:
            error = f"{error}; {fallback_error}" if error else fallback_error
    if not results:
        message = (
            f"I could not complete the live image search. {error}"
            if error
            else "I searched for images but did not find matching results."
        )
        return {
            "response": message,
            "blocks": [
                {
                    "type": "tool_result",
                    "title": "Image search unavailable" if error else "No image results",
                    "data": {
                        "query": query,
                        "search_query": search_query,
                        "query_reason": planned["reason"],
                        "provider": provider,
                        "configured": DDGS is not None,
                        "error": error,
                    },
                }
            ],
            "quiz": None,
            "feedback": None,
            "action": {
                "tool": "image_search",
                "input": query,
                "output": {
                    "results": 0,
                    "provider": provider,
                    "search_query": search_query,
                    "query_reason": planned["reason"],
                    "error": error,
                },
            },
        }

    response = f"Here are image results for {search_query}."
    return {
        "response": response,
        "blocks": [
            {"type": "text", "text": response},
            {"type": "image_results", "results": results},
        ],
        "quiz": None,
        "feedback": None,
        "action": {
            "tool": "image_search",
            "input": query,
            "output": {
                "results": len(results),
                "provider": provider,
                "search_query": search_query,
                "query_reason": planned["reason"],
            },
        },
    }
