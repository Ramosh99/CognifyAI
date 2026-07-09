import re
from typing import Dict, List, Literal, Tuple

import requests

from app.agents.chat_tools.web_search import _duckduckgo_search
from app.core.config import settings


SensitivityLevel = Literal["low", "medium", "high"]


HIGH_SENSITIVITY_TERMS = {
    "medical",
    "medicine",
    "disease",
    "disorder",
    "symptom",
    "diagnosis",
    "treatment",
    "therapy",
    "mental health",
    "hallucination",
    "hallucinations",
    "finance",
    "investment",
    "legal",
    "law",
    "contract",
    "tax",
}


def classify_topic_sensitivity(topic: str) -> Dict[str, str]:
    text = topic.lower()
    if any(term in text for term in HIGH_SENSITIVITY_TERMS):
        sensitivity = "high"
    elif any(term in text for term in ("exam", "advanced", "research", "science")):
        sensitivity = "medium"
    else:
        sensitivity = "low"

    if any(term in text for term in ("medical", "medicine", "disease", "symptom", "diagnosis", "hallucination", "mental health")):
        domain = "health_science"
    elif any(term in text for term in ("ai", "machine learning", "deep learning", "computer", "software", "algorithm")):
        domain = "computer_science"
    elif any(term in text for term in ("finance", "investment", "stock", "tax")):
        domain = "finance"
    elif any(term in text for term in ("law", "legal", "contract")):
        domain = "law"
    else:
        domain = "general_education"

    return {"topic_domain": domain, "sensitivity_level": sensitivity}


def _clean_text(text: str) -> str:
    clean = re.sub(r"\s+", " ", text or "")
    return clean.strip()


def _wikipedia_title(query: str) -> str | None:
    response = requests.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "opensearch",
            "search": query,
            "limit": 1,
            "namespace": 0,
            "format": "json",
        },
        headers={"User-Agent": "CognifyAI/1.0 educational research"},
        timeout=settings.WEB_SEARCH_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    titles = data[1] if len(data) > 1 else []
    return titles[0] if titles else None


def _wikipedia_summary(query: str) -> Tuple[List[Dict[str, object]], str | None]:
    try:
        title = _wikipedia_title(query)
        if not title:
            return [], None
        response = requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{title.replace(' ', '_')}",
            headers={"User-Agent": "CognifyAI/1.0 educational research"},
            timeout=settings.WEB_SEARCH_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        extract = _clean_text(data.get("extract", ""))
        if not extract:
            return [], None
        return [
            {
                "text": extract[:1400],
                "score": 1.0,
                "topic": query,
                "source": f"Wikipedia: {data.get('title') or title}",
                "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
                "kind": "research",
            }
        ], None
    except Exception as exc:
        return [], f"Wikipedia research failed: {exc}"


def _web_research(query: str) -> Tuple[List[Dict[str, object]], str | None]:
    results, error = _duckduckgo_search(query)
    if not results:
        return [], error
    return [
        {
            "text": _clean_text(f"{item.get('title', '')}. {item.get('snippet', '')}")[:900],
            "score": 0.75,
            "topic": query,
            "source": item.get("title") or item.get("url"),
            "url": item.get("url", ""),
            "kind": "research",
        }
        for item in results[:4]
        if item.get("title") or item.get("snippet")
    ], None


def research_topic(topic: str) -> Dict[str, object]:
    profile = classify_topic_sensitivity(topic)
    wiki_results, wiki_error = _wikipedia_summary(topic)
    web_results: List[Dict[str, object]] = []
    web_error = None
    if len(wiki_results) < 1:
        web_results, web_error = _web_research(topic)

    sources = [*wiki_results, *web_results]
    return {
        "profile": profile,
        "sources": sources,
        "errors": [err for err in (wiki_error, web_error) if err],
    }
