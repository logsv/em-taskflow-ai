"""
Unit Tests for RAGPipelineProcessor (chunker.py & reranker.py)
"""

from app.services.rag_processor.chunker import RAGChunker
from app.services.rag_processor.reranker import CrossEncoderReranker


def test_chunker_default_512_tokens(sample_text_content):
    chunker = RAGChunker(default_chunk_size=512, default_chunk_overlap=64)
    chunks = chunker.chunk_text(sample_text_content, "doc.pdf")
    
    assert len(chunks) > 0
    assert chunks[0]["chunk_index"] == 0
    assert "[Document: doc.pdf]" in chunks[0]["content"]
    assert "parent_content" in chunks[0]


def test_chunker_empty():
    chunker = RAGChunker()
    chunks = chunker.chunk_text("", "doc.pdf")
    assert len(chunks) == 0


def test_reranker_sorting():
    reranker = CrossEncoderReranker()
    query = "FlashRank Cross-Encoder reranking"
    candidates = [
        {"id": "c1", "content": "Weather forecast for sunny weekend", "filename": "doc.pdf", "chunk_index": 0},
        {"id": "c2", "content": "FlashRank Cross-Encoder reranking filters chunks", "filename": "doc.pdf", "chunk_index": 1},
        {"id": "c3", "content": "Node.js API Express backend routing", "filename": "doc.pdf", "chunk_index": 2},
    ]

    reranked = reranker.rerank(query, candidates, top_n=2)
    
    assert len(reranked) <= 2
    assert reranked[0]["id"] == "c2"
    assert "FlashRank" in reranked[0]["content"]
