from typing import Any, Dict, List, Optional

from app.agents.chat_tools.query_planner import plan_query
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
    history: List[Dict[str, str]],
    intent: str,
    topic: Optional[str],
    top_k: int,
) -> Dict[str, Any]:
    planned = plan_query(
        target="document_search",
        message=message,
        history=history,
        topic=topic,
    )
    query = planned["query"]
    search_top_k = 10 if intent == "quiz" else top_k
    if intent == "analyze":
        query = plan_query(
            target="document_search",
            message=f"{message} {topic or ''}".strip(),
            history=history,
            topic=topic,
        )["query"]
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
            "input": message,
            "output": {
                "query": query,
                "query_reason": planned["reason"],
                "results": len(results),
            },
        },
    }
