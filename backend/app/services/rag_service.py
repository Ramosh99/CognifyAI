"""
RAG Service (Orchestrator) — Supabase SDK backend
--------------------------------------------------
Uses the supabase-py REST client (HTTPS) instead of a direct psycopg2 connection.

Two main operations:
  1. ingest()   — Hierarchical AST chunk → breadcrumb enrichment → embed → store in Supabase
  2. retrieve() — Hybrid search (dense HNSW + sparse BM25) via match_documents_hybrid RPC,
                  then rerank and filter via RerankService
"""
from typing import List, Optional
import uuid

from supabase import create_client, Client
from app.core.config import settings
from app.services.embedding_service import embedding_service
from app.services.chunking_service import chunking_service
from app.services.rerank_service import rerank_service, RerankedChunk


def _get_supabase() -> Client:
    """Create a Supabase client using the URL and service-role key from settings."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in your .env file.")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


class RAGService:
    # ------------------------------------------------------------------ #
    # Ingestion
    # ------------------------------------------------------------------ #

    def ingest(
        self,
        text_content: str,
        user_id: str,
        metadata: Optional[dict] = None,
    ) -> int:
        """
        Enterprise ingestion pipeline:
          1. Hierarchical AST chunking (preserves heading structure)
          2. Breadcrumb enrichment (injects doc > section context into each chunk)
          3. Dense embedding of enriched text
          4. Store chunk + parent_text + enriched_text + RBAC columns in Supabase

        Args:
            text_content: Raw document text to ingest.
            user_id:      The authenticated user's UUID — data is scoped to this user.
            metadata:     Optional dict with 'topic', 'source', 'doc_title', 'department'.

        Returns:
            Number of chunks stored.
        """
        meta = metadata or {}
        doc_title = meta.get("doc_title") or meta.get("source") or "Untitled Document"

        # Stage 1: Hierarchical AST chunking with breadcrumb enrichment
        chunk_objects = chunking_service.hierarchical_split(
            text=text_content,
            doc_title=doc_title,
        )

        if not chunk_objects:
            return 0

        # Stage 2: Batch embed the enriched texts for higher quality retrieval
        enriched_texts = [c.enriched_text for c in chunk_objects]
        vectors = embedding_service.embed_batch(enriched_texts)

        client = _get_supabase()

        rows = []
        for chunk, vec in zip(chunk_objects, vectors):
            row = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "text": chunk.text,                          # raw chunk text
                "enriched_text": chunk.enriched_text,        # breadcrumb + text (embedded)
                "parent_text": chunk.parent_text,            # surrounding section context
                "doc_title": chunk.doc_title,
                "section_title": chunk.section_title,
                "topic": meta.get("topic"),
                "source": meta.get("source"),
                "department": meta.get("department"),
                "embedding": vec,
            }
            rows.append(row)

        # Batch upsert — Supabase REST API handles chunking internally
        response = client.table("documents").insert(rows).execute()

        if hasattr(response, "error") and response.error:
            raise RuntimeError(f"Supabase insert error: {response.error}")

        return len(rows)

    # ------------------------------------------------------------------ #
    # Retrieval
    # ------------------------------------------------------------------ #

    def retrieve(
        self,
        query: str,
        user_id: str,
        top_k: int = 10,
        filter_topic: Optional[str] = None,
        department: Optional[str] = None,
        permissions: Optional[List[str]] = None,
        apply_rerank: bool = True,
        rerank_top_n: int = 5,
        min_relevance: Optional[float] = None,
    ) -> List[dict]:
        """
        Full enterprise retrieval pipeline:
          1. Embed query
          2. Call match_documents_hybrid SQL RPC (RRF: dense HNSW + sparse BM25)
          3. Optionally rerank and filter results via RerankService

        Args:
            query:        User question or search string.
            user_id:      Only return chunks belonging to this user (RBAC).
            top_k:        Number of raw hybrid candidates to fetch before reranking.
            filter_topic: Optional topic filter.
            department:   RBAC department filter.
            permissions:  RBAC permission tags.
            apply_rerank: Whether to apply cross-attention reranking and relevance filtering.
            rerank_top_n: Max chunks to return after reranking.
            min_relevance: Minimum relevance score threshold (default: from RerankService).

        Returns:
            List of dicts with 'text', 'parent_text', 'doc_title', 'section_title', 'score', 'source'.
        """
        query_vec = embedding_service.embed_query(query)
        client = _get_supabase()

        # Stage 1: Hybrid RRF retrieval (dense + sparse BM25)
        try:
            response = client.rpc(
                "match_documents_hybrid",
                {
                    "query_embedding": query_vec,
                    "query_text": query,
                    "match_count": top_k,
                    "p_user_id": user_id,
                    "p_department": department,
                    "p_permissions": permissions,
                    "filter_topic": filter_topic,
                },
            ).execute()
        except Exception:
            # Graceful fallback to dense-only search if hybrid RPC is unavailable
            response = client.rpc(
                "match_documents",
                {
                    "query_embedding": query_vec,
                    "match_count": top_k,
                    "filter_topic": filter_topic,
                    "p_user_id": user_id,
                },
            ).execute()

        if hasattr(response, "error") and response.error:
            raise RuntimeError(f"Supabase RPC error: {response.error}")

        rows = response.data or []

        # Normalize raw candidates
        candidates = [
            {
                "text": row.get("text", ""),
                "parent_text": row.get("parent_text") or row.get("text", ""),
                "enriched_text": row.get("enriched_text"),
                "doc_title": row.get("doc_title") or "Document",
                "section_title": row.get("section_title") or "",
                "score": round(float(row.get("score", 0.0)), 4),
                "topic": row.get("topic"),
                "source": row.get("source"),
                "department": row.get("department"),
            }
            for row in rows
        ]

        if not apply_rerank or not candidates:
            return candidates[:rerank_top_n]

        # Stage 2: Cross-attention reranking + relevance filtering
        reranked: List[RerankedChunk] = rerank_service.rerank_and_filter(
            query=query,
            candidates=candidates,
            top_n=rerank_top_n,
            min_threshold=min_relevance,
        )

        return [
            {
                "text": c.text,
                "parent_text": c.parent_text,
                "doc_title": c.doc_title,
                "section_title": c.section_title,
                "score": c.relevance_score,
                "source": c.source,
                "department": c.department,
            }
            for c in reranked
        ]


# Singleton — shared across all requests
rag_service = RAGService()
