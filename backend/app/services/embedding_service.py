"""
Embedding Service
-----------------
Uses BAAI/bge-base-en-v1.5 via sentence-transformers to generate dense
vector embeddings for text chunks. Runs fully locally, no API key needed.
"""
from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np

# Model is downloaded once and cached locally by sentence-transformers
MODEL_NAME = "BAAI/bge-base-en-v1.5"

class EmbeddingService:
    def __init__(self):
        print(f"Loading embedding model: {MODEL_NAME}")
        self._model = SentenceTransformer(MODEL_NAME)
        print("Embedding model loaded successfully.")

    def embed(self, text: str) -> List[float]:
        """
        Generate a single embedding vector for a given text string.
        BGE models are best used with an instruction prefix for retrieval tasks.
        """
        # Prefix is recommended for retrieval use-cases with BGE models
        prefixed_text = f"Represent this passage for searching relevant passages: {text}"
        embedding = self._model.encode(prefixed_text, normalize_embeddings=True)
        return embedding.tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of text strings (more efficient than one-by-one).
        """
        prefixed_texts = [
            f"Represent this passage for searching relevant passages: {t}" for t in texts
        ]
        embeddings = self._model.encode(prefixed_texts, normalize_embeddings=True, show_progress_bar=True)
        return embeddings.tolist()

    def embed_query(self, query: str) -> List[float]:
        """
        Generate an embedding for a user search query.
        Uses a different prefix suited for queries vs. passages.
        """
        prefixed_query = f"Represent this sentence for searching relevant passages: {query}"
        embedding = self._model.encode(prefixed_query, normalize_embeddings=True)
        return embedding.tolist()


# Singleton instance — loaded once on backend startup
embedding_service = EmbeddingService()
