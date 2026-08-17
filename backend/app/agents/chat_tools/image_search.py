import re
from typing import Dict, List, Tuple

import requests

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

from app.agents.chat_tools.query_planner import plan_query


def _plain_text(value: str) -> str:
    clean = re.sub(r"<[^>]+>", "", value or "")
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def _image_query_variants(search_query: str) -> List[str]:
    base = re.sub(r"\b(wikimedia commons|wikipedia|wikiimage)\b", "", search_query, flags=re.I)
    base = re.sub(r"\b(architecture|educational image|reference image)\b", "", base, flags=re.I)
    base = re.sub(r"\s+", " ", base).strip()
    variants = [search_query, base]

    simplified = re.sub(
        r"\b(diagram|visualization|visualisation|applications?|examples?|comparison|overview)\b",
        "",
        base,
        flags=re.I,
    )
    simplified = re.sub(r"\s+", " ", simplified).strip()
    if simplified:
        variants.append(simplified)

    words = simplified.split()
    if len(words) > 3:
        variants.append(" ".join(words[:3]))

    unique = []
    seen = set()
    for query in variants:
        key = query.lower()
        if query and key not in seen:
            seen.add(key)
            unique.append(query)
    return unique


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
                # Wikimedia strictly requires a User-Agent with contact information (URL or email)
                # to prevent blocking in deployed (cloud) environments.
                "User-Agent": "CognifyAI/1.0 (https://github.com/Ramosh99/CognifyAI; admin@cognifyai.app)",
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
            source = _plain_text((metadata.get("Artist") or {}).get("value") or "Wikimedia Commons")
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
    prefer_wikimedia = bool(re.search(r"\b(wikimedia|wikipedia|wikiimage)\b", query, flags=re.I))
    results: List[Dict[str, str]] = []
    error = None
    if prefer_wikimedia:
        for fallback_query in _image_query_variants(search_query):
            results, error = _wikimedia_image_search(fallback_query)
            if results:
                provider = "Wikimedia Commons"
                break
    if not results:
        results, error = _duckduckgo_image_search(search_query)
    if not results:
        fallback_results = []
        fallback_error = None
        for fallback_query in _image_query_variants(search_query):
            fallback_results, fallback_error = _wikimedia_image_search(fallback_query)
            if fallback_results:
                break
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
