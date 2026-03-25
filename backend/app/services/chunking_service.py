"""
Chunking Service
----------------
Splits large documents into smaller, overlapping text chunks suitable for
embedding and retrieval. Uses a simple recursive character-based splitter.
"""
from typing import List
import re

class ChunkingService:
    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 64):
        """
        Args:
            chunk_size: Target number of characters per chunk.
            chunk_overlap: Number of characters to overlap between consecutive chunks.
                           Overlap ensures context isn't lost at chunk boundaries.
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_text(self, text: str) -> List[str]:
        """
        Split a long string into a list of overlapping chunks.
        Tries to split on paragraph / sentence boundaries first for natural breaks.
        """
        # Normalise whitespace
        text = re.sub(r"\s+", " ", text).strip()

        if len(text) <= self.chunk_size:
            return [text]

        chunks: List[str] = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size

            if end >= len(text):
                chunks.append(text[start:])
                break

            # Try to break at a sentence boundary (". ") or newline near the end
            split_at = text.rfind(". ", start, end)
            
            # If no period is found, or the period is so close to 'start' that subtracting chunk_overlap 
            # would cause us to go backwards (infinite loop), just do a hard cut at 'end'.
            if split_at == -1 or (split_at + 1 - self.chunk_overlap) <= start:
                split_at = end  # Fall back to hard cut

            chunks.append(text[start : split_at + 1].strip())
            # Move forward, keeping `chunk_overlap` characters of context
            start = split_at + 1 - self.chunk_overlap

        return [c for c in chunks if c]  # Remove any empty strings

    def split_documents(self, documents: List[str]) -> List[str]:
        """Convenience method: split a list of documents into chunks."""
        all_chunks: List[str] = []
        for doc in documents:
            all_chunks.extend(self.split_text(doc))
        return all_chunks


# Default singleton with sensible defaults for learning documents
chunking_service = ChunkingService(chunk_size=512, chunk_overlap=64)
