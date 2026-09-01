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


def test_reranker_empty_candidates():
    reranker = CrossEncoderReranker()
    assert reranker.rerank("any query", []) == []


def test_reranker_single_candidate():
    reranker = CrossEncoderReranker()
    candidates = [{"id": "c1", "content": "Only candidate available", "filename": "doc.pdf", "chunk_index": 0}]
    reranked = reranker.rerank("candidate", candidates, top_n=5)
    assert len(reranked) == 1
    assert reranked[0]["id"] == "c1"


def test_chunker_metadata_preservation():
    chunker = RAGChunker(default_chunk_size=200, default_chunk_overlap=50)
    text = "Section 1: Database Architecture. Section 2: PostgreSQL Indexing and Trigram full-text search."
    metadata = {"author": "Alex", "version": "1.2"}
    chunks = chunker.chunk_text(text, "architecture.md", metadata=metadata)
    assert len(chunks) >= 1
    assert chunks[0]["metadata"]["author"] == "Alex"
    assert chunks[0]["metadata"]["version"] == "1.2"


def test_chunker_whitespace_and_newlines_only():
    chunker = RAGChunker()
    assert chunker.chunk_text("   \n\n\t   ", "empty.txt") == []


def test_chunker_paragraph_break_preservation():
    chunker = RAGChunker(default_chunk_size=100, default_chunk_overlap=20)
    text = (
        "Paragraph One: Core Engineering Metrics and DORA standards.\n\n"
        "Paragraph Two: Multi-tier caching architecture with Redis vector similarity.\n\n"
        "Paragraph Three: Temporal workflow state management and cron schedules."
    )
    chunks = chunker.chunk_text(text, "overview.md")
    assert len(chunks) >= 1
    for chunk in chunks:
        assert "[Document: overview.md]" in chunk["content"]
        assert chunk["token_count"] > 0


def test_chunker_windowed_parent_context_chaining():
    chunker = RAGChunker(default_chunk_size=50, default_chunk_overlap=10)
    text = "Block A content here. " * 15 + "Block B content here. " * 15 + "Block C content here. " * 15
    chunks = chunker.chunk_text(text, "chain.md")
    if len(chunks) > 1:
        # Check that parent_content contains windowed context
        assert "parent_content" in chunks[0]
        assert len(chunks[0]["parent_content"]) >= len(chunks[0]["content"])


def test_reranker_top_n_exceeds_candidates():
    reranker = CrossEncoderReranker()
    candidates = [
        {"id": "a", "content": "Database sharding and replication", "filename": "db.md", "chunk_index": 0},
        {"id": "b", "content": "Frontend React state management", "filename": "ui.md", "chunk_index": 0}
    ]
    reranked = reranker.rerank("Database sharding", candidates, top_n=10)
    assert len(reranked) == 2
    assert reranked[0]["id"] == "a"


def test_reranker_case_insensitivity():
    reranker = CrossEncoderReranker()
    candidates = [
        {"id": "c1", "content": "TEMPORAL WORKFLOW ENGINE FOR CRON", "filename": "t.md", "chunk_index": 0},
        {"id": "c2", "content": "Unrelated topic completely", "filename": "u.md", "chunk_index": 0}
    ]
    reranked = reranker.rerank("temporal workflow", candidates, top_n=1)
    assert len(reranked) == 1
    assert reranked[0]["id"] == "c1"


