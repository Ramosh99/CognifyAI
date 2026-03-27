"""
RAG Service (Orchestrator) — Supabase SDK backend
--------------------------------------------------
Uses the supabase-py REST client (HTTPS) instead of a direct psycopg2 connection.
This works on all Supabase tiers including the free (Nano) plan.

Two main operations:
  1. ingest()   — chunk a document, embed the chunks, store in Supabase via REST
  2. retrieve() — embed a query, call the match_documents RPC function for cosine search
"""
from typing import List, Optional
import uuid

from supabase import create_client, Client
from app.core.config import settings
from app.services.embedding_service import embedding_service
from app.services.chunking_service import chunking_service


def _get_supabase() -> Client:
    """Create a Supabase client using the URL and service-role key from settings."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in your .env file.")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


class RAGService:
    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def ingest(self, text_content: str, metadata: Optional[dict] = None) -> int:
        """
        Chunk → embed → store pipeline.

        Args:
            text_content: Raw document text to ingest.
            metadata:     Optional dict with 'topic' and/or 'source' keys.

        Returns:
            Number of chunks stored.
        """
        chunks = chunking_service.split_text(text_content)
        if not chunks:
            return 0

        vectors = embedding_service.embed_batch(chunks)
        meta = metadata or {}
        client = _get_supabase()

        rows = [
            {
                "id": str(uuid.uuid4()),
                "text": chunk,
                "topic": meta.get("topic"),
                "source": meta.get("source"),
                "embedding": vec,          # supabase-py sends this as a JSON array → pgvector accepts it
            }
            for chunk, vec in zip(chunks, vectors)
        ]

        # Insert in one batch call
        response = client.table("documents").insert(rows).execute()

        if hasattr(response, "error") and response.error:
            raise RuntimeError(f"Supabase insert error: {response.error}")

        return len(rows)

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        filter_topic: Optional[str] = None,
    ) -> List[dict]:
        """
        Embed a query and return the top-k most similar document chunks.

        Args:
            query:        User question or search string.
            top_k:        Number of results to return.
            filter_topic: Optional topic filter (e.g., "networking").

        Returns:
            List of dicts with 'text', 'score', 'topic', 'source'.
        """
        query_vec = embedding_service.embed_query(query)
        client = _get_supabase()

        # Call the match_documents Postgres function via Supabase RPC
        response = client.rpc(
            "match_documents",
            {
                "query_embedding": query_vec,
                "match_count": top_k,
                "filter_topic": filter_topic,
            },
        ).execute()

        if hasattr(response, "error") and response.error:
            raise RuntimeError(f"Supabase RPC error: {response.error}")

        rows = response.data or []

        return [
            {
                "text": row.get("text", ""),
                "score": round(float(row.get("score", 0.0)), 4),
                "topic": row.get("topic"),
                "source": row.get("source"),
            }
            for row in rows
        ]


# Singleton — shared across all requests
rag_service = RAGService()
