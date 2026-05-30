from typing import Any, Dict, List, Optional

from app.services.rag_service import rag_service


def _source_payload(results: List[dict]) -> List[Dict[str, Any]]:
    return [
        {
            "text": result.get("text", ""),
            "score": result.get("score", 0.0),
            "topic": result.get("topic"),
            "source": result.get("source"),
        }
        for result in results
    ]


def retrieve_documents(
    *,
    message: str,
    user_id: str,
    intent: str,
    topic: Optional[str],
    top_k: int,
) -> Dict[str, Any]:
    query = topic or message
    search_top_k = 10 if intent == "quiz" else top_k
    if intent == "analyze":
        query = f"{message} {topic or ''}".strip()
        search_top_k = 5

    results = rag_service.retrieve(
        query=query,
        user_id=user_id,
        top_k=search_top_k,
        filter_topic=topic if intent == "study" else None,
    )

    return {
        "sources": _source_payload(results),
        "context_chunks": [result["text"] for result in results],
        "action": {
            "tool": "document_search",
            "input": query,
            "output": {"results": len(results)},
        },
    }
