"""
RAG Chunker Engine
Token-aware 512-token chunking with 64-token overlap and paragraph boundary cascades.
"""

import math


class RAGChunker:
    """Chunker implementing industry-standard 512-token chunk size and 64-token overlap."""

    def __init__(self, default_chunk_size: int = 512, default_chunk_overlap: int = 64):
        self.chunk_size = default_chunk_size
        self.chunk_overlap = default_chunk_overlap

    def chunk_text(self, text: str, filename: str, chunk_size: int = None, chunk_overlap: int = None, metadata: dict = None) -> list:
        """
        Chunk text into token-aware window segments with windowed parent context.
        Approximates ~4 characters per token.
        """
        c_size = chunk_size or self.chunk_size
        c_overlap = chunk_overlap or self.chunk_overlap

        # Target character counts (~4 chars per token)
        target_char_length = c_size * 4
        overlap_char_length = c_overlap * 4
        step = max(50, target_char_length - overlap_char_length)

        if not text or len(text.strip()) == 0:
            return []

        clean_text = text.strip()
        raw_chunks = []
        start_idx = 0

        while start_idx < len(clean_text):
            end_idx = min(len(clean_text), start_idx + target_char_length)

            # Snap to paragraph or sentence break if available
            if end_idx < len(clean_text):
                break_point = clean_text.rfind("\n\n", start_idx + 100, end_idx)
                if break_point == -1:
                    break_point = clean_text.rfind("\n", start_idx + 100, end_idx)
                if break_point == -1:
                    break_point = clean_text.rfind(". ", start_idx + 100, end_idx)
                if break_point != -1:
                    end_idx = break_point + 1

            chunk_content = clean_text[start_idx:end_idx].strip()
            if chunk_content:
                raw_chunks.append(chunk_content)

            start_idx += step

        # Build output chunk objects with windowed parent content
        chunks = []
        header = f"[Document: {filename}]\n"

        for idx, child_text in enumerate(raw_chunks):
            prev_text = raw_chunks[idx - 1] if idx > 0 else ""
            next_text = raw_chunks[idx + 1] if idx < len(raw_chunks) - 1 else ""
            
            parent_parts = [p for p in [prev_text, child_text, next_text] if p]
            parent_text = "\n---\n".join(parent_parts)

            chunk_dict = {
                "chunk_index": idx,
                "content": f"{header}{child_text}",
                "parent_content": f"{header}{parent_text}",
                "token_count": math.ceil(len(child_text) / 4),
            }
            if metadata is not None:
                chunk_dict["metadata"] = dict(metadata)

            chunks.append(chunk_dict)

        return chunks
