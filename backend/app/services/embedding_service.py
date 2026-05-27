"""
Remote Embedding Service
------------------------
Calls the dedicated embedding Hugging Face Space. The backend stays lightweight
and never loads sentence-transformers or torch locally.
"""
from typing import List

import requests

from app.core.config import settings


class EmbeddingService:
    def __init__(self, base_url: str, token: str = "", timeout: float = 120.0):
        if not base_url:
            raise ValueError(
                "EMBEDDING_SERVICE_URL must be set. "
                "Example: https://Ramosh99-cognify-embedding.hf.space"
            )

        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _post(self, path: str, payload: dict) -> dict:
        response = requests.post(
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def embed(self, text: str) -> List[float]:
        return self._post("/embed", {"text": text, "kind": "passage"})["embedding"]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        return self._post("/embed/batch", {"texts": texts, "kind": "passage"})[
            "embeddings"
        ]

    def embed_query(self, query: str) -> List[float]:
        return self._post("/embed", {"text": query, "kind": "query"})["embedding"]


embedding_service = EmbeddingService(
    settings.EMBEDDING_SERVICE_URL,
    token=settings.EMBEDDING_SERVICE_TOKEN,
    timeout=settings.EMBEDDING_SERVICE_TIMEOUT,
)
