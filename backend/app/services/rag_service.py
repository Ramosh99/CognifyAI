"""
RAG Service (Orchestrator)
--------------------------
Ties together chunking, embedding, and vector storage.
Provides two main operations:
  1. ingest()  — chunk a document text, embed chunks, store in Qdrant
  2. retrieve() — embed a query and fetch the top-k most relevant chunks
"""
from typing import List, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)
import uuid

from .embedding_service import embedding_service
from .chunking_service import chunking_service

COLLECTION_NAME = "cognifyai_docs"
VECTOR_DIM = 768  # BAAI/bge-base-en-v1.5 outputs 768-dimensional vectors


class RAGService:
    def __init__(self):
        # In-memory Qdrant (no server needed for development)
        # Replace with QdrantClient(url="...", api_key="...") for production
        self._client = QdrantClient(":memory:")
        self._ensure_collection()

    # ------------------------------------------------------------------ #
    # Private helpers
    # ------------------------------------------------------------------ #

    def _ensure_collection(self):
        """Create the Qdrant collection if it doesn't already exist."""
        existing = [c.name for c in self._client.get_collections().collections]
        if COLLECTION_NAME not in existing:
            self._client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
            )
            print(f"Created Qdrant collection: {COLLECTION_NAME}")

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def ingest(self, text: str, metadata: Optional[dict] = None) -> int:
        """
        Chunk → embed → store pipeline.

        Args:
            text:     Raw document text to ingest.
            metadata: Optional dict stored alongside each chunk for filtering.

        Returns:
            Number of chunks stored.
        """
        chunks = chunking_service.split_text(text)
        if not chunks:
            return 0

        vectors = embedding_service.embed_batch(chunks)

        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload={
                    "text": chunk,
                    **(metadata or {}),
                },
            )
            for chunk, vec in zip(chunks, vectors)
        ]

        self._client.upsert(collection_name=COLLECTION_NAME, points=points)
        return len(points)

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        filter_topic: Optional[str] = None,
    ) -> List[dict]:
        """
        Embed a query and return the top-k most similar chunks.

        Args:
            query:        User question or search string.
            top_k:        Number of results to return.
            filter_topic: Optional metadata filter (e.g., "networking").

        Returns:
            List of dicts with 'text', 'score', and any metadata.
        """
        query_vec = embedding_service.embed_query(query)

        search_filter = None
        if filter_topic:
            search_filter = Filter(
                must=[FieldCondition(key="topic", match=MatchValue(value=filter_topic))]
            )

        results = self._client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vec,
            limit=top_k,
            query_filter=search_filter,
        )

        return [
            {
                "text": hit.payload.get("text", ""),
                "score": round(hit.score, 4),
                **{k: v for k, v in hit.payload.items() if k != "text"},
            }
            for hit in results
        ]


# Singleton — shared across all requests
rag_service = RAGService()
