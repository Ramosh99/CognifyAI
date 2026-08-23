"""
Chunking Service
----------------
Two chunking strategies:

1. split_text()          — Legacy naive recursive character splitter (kept for backward compat).
2. hierarchical_split()  — Enterprise AST-based hierarchical splitter with breadcrumb enrichment.
                           Parses heading structure (# > ## > ###) into a document tree,
                           preserves section context, and injects breadcrumb paths into
                           each chunk's enriched_text before embedding.
"""
from dataclasses import dataclass, field
from typing import List, Optional
import re


@dataclass
class DocumentChunk:
    text: str                        # Raw chunk text (stored in DB as-is)
    enriched_text: str               # Breadcrumb-prefixed text (used for embedding)
    parent_text: str                 # Full parent section content (sent to LLM for context)
    doc_title: str                   # Top-level document title
    section_title: str               # Immediate section title
    breadcrumb: str                  # Full path: "Doc > Section > Subsection"
    level: int                       # Heading depth (1 = #, 2 = ##, 3 = ###, 4 = leaf)


class ChunkingService:
    # ------------------------------------------------------------------ #
    # Legacy naive splitter (kept for backward compatibility)
    # ------------------------------------------------------------------ #

    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 64):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_text(self, text: str) -> List[str]:
        """
        Split a long string into a list of overlapping chunks.
        Tries to split on paragraph / sentence boundaries first.
        """
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
            split_at = text.rfind(". ", start, end)
            if split_at == -1 or (split_at + 1 - self.chunk_overlap) <= start:
                split_at = end
            chunks.append(text[start: split_at + 1].strip())
            start = split_at + 1 - self.chunk_overlap
        return [c for c in chunks if c]

    def split_documents(self, documents: List[str]) -> List[str]:
        """Convenience: split a list of documents into chunks."""
        all_chunks: List[str] = []
        for doc in documents:
            all_chunks.extend(self.split_text(doc))
        return all_chunks

    # ------------------------------------------------------------------ #
    # Enterprise Hierarchical AST Splitter
    # ------------------------------------------------------------------ #

    def hierarchical_split(
        self,
        text: str,
        doc_title: str = "Document",
        max_leaf_chars: int = 800,
    ) -> List[DocumentChunk]:
        """
        Parses a Markdown document into an AST-like tree following heading hierarchy,
        then enriches each leaf chunk with:
          - A breadcrumb path (e.g. "HR Policy 2024 > Leave Benefits > Annual Leave:")
          - Parent text (the full containing section) for Small-to-Big context expansion

        Args:
            text:          Raw document text (Markdown with # headings preferred).
            doc_title:     Top-level document name for the breadcrumb root.
            max_leaf_chars: Max character size for leaf paragraph chunks.

        Returns:
            List of DocumentChunk objects ready for embedding and storage.
        """
        # Split into lines and group by heading/paragraph sections
        lines = text.splitlines()
        sections = self._parse_sections(lines, doc_title)
        chunks: List[DocumentChunk] = []

        for section in sections:
            parent_text = section["content"].strip()
            if not parent_text:
                continue

            breadcrumb = self._build_breadcrumb(section["path"])
            # Split large sections into leaf paragraphs
            leaf_paragraphs = self._split_into_paragraphs(parent_text, max_leaf_chars)

            for para in leaf_paragraphs:
                if not para.strip():
                    continue
                enriched = f"{breadcrumb}\n{para.strip()}"
                chunks.append(
                    DocumentChunk(
                        text=para.strip(),
                        enriched_text=enriched,
                        parent_text=parent_text,
                        doc_title=doc_title,
                        section_title=section["path"][-1] if section["path"] else doc_title,
                        breadcrumb=breadcrumb,
                        level=section["level"],
                    )
                )

        # If no headings found, fall back to naive splitting with doc breadcrumb
        if not chunks:
            fallback_paragraphs = self._split_into_paragraphs(text, max_leaf_chars)
            for para in fallback_paragraphs:
                if not para.strip():
                    continue
                breadcrumb = f"{doc_title}:"
                chunks.append(
                    DocumentChunk(
                        text=para.strip(),
                        enriched_text=f"{breadcrumb}\n{para.strip()}",
                        parent_text=text[:2000],
                        doc_title=doc_title,
                        section_title=doc_title,
                        breadcrumb=breadcrumb,
                        level=4,
                    )
                )

        return chunks

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _parse_sections(self, lines: List[str], doc_title: str) -> List[dict]:
        """
        Walks lines and groups content under their nearest heading, building
        a path list (breadcrumb) for each section.
        """
        HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)")
        sections = []
        current_path: List[str] = [doc_title]
        current_level = 0
        current_content_lines: List[str] = []

        def flush():
            if current_content_lines:
                sections.append({
                    "path": list(current_path),
                    "level": current_level,
                    "content": "\n".join(current_content_lines),
                })

        for line in lines:
            m = HEADING_RE.match(line)
            if m:
                flush()
                current_content_lines = []
                depth = len(m.group(1))      # number of # symbols
                title = m.group(2).strip()

                # Trim path back to depth-1 ancestors
                if depth == 1:
                    current_path = [doc_title, title]
                elif depth == 2:
                    current_path = current_path[:2] + [title] if len(current_path) >= 2 else [doc_title, title]
                elif depth == 3:
                    current_path = current_path[:3] + [title] if len(current_path) >= 3 else current_path + [title]
                else:
                    current_path = current_path[:4] + [title]

                current_level = depth
            else:
                current_content_lines.append(line)

        flush()
        return sections

    def _build_breadcrumb(self, path: List[str]) -> str:
        """Formats path list into breadcrumb string: 'Doc > Section > Subsection:'"""
        return " > ".join(part for part in path if part) + ":"

    def _split_into_paragraphs(self, text: str, max_chars: int) -> List[str]:
        """
        Splits text on double-newlines (paragraph breaks) first,
        then further splits oversized paragraphs on sentence boundaries.
        """
        raw_paragraphs = re.split(r"\n{2,}", text)
        result: List[str] = []
        for para in raw_paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(para) <= max_chars:
                result.append(para)
            else:
                # Split large paragraphs at sentence boundaries
                sentences = re.split(r"(?<=[.!?])\s+", para)
                current = ""
                for sentence in sentences:
                    if len(current) + len(sentence) + 1 <= max_chars:
                        current = (current + " " + sentence).strip()
                    else:
                        if current:
                            result.append(current)
                        current = sentence
                if current:
                    result.append(current)
        return result


# Default singleton
chunking_service = ChunkingService(chunk_size=512, chunk_overlap=64)
