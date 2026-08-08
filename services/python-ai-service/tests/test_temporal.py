"""
Unit Tests for Temporal Activities & RAG Workflow
"""

import pytest
from app.temporal.activities import (
    extract_text_activity,
    chunk_text_activity,
    persist_and_embed_activity,
)


@pytest.mark.asyncio
async def test_temporal_activities():
    # Test activity 1: Extract Text (direct text parameter)
    extract_res = await extract_text_activity({"filename": "test.txt", "text": "Sample temporal text content"})
    assert extract_res["filename"] == "test.txt"
    assert extract_res["text"] == "Sample temporal text content"

    # Test activity 2: Chunk Text
    chunk_res = await chunk_text_activity({"filename": "test.txt", "text": extract_res["text"]})
    assert chunk_res["filename"] == "test.txt"
    assert chunk_res["total_chunks"] > 0

    # Test activity 3: Persist & Embed
    persist_res = await persist_and_embed_activity({"filename": "test.txt", "chunks": chunk_res["chunks"]})
    assert persist_res["status"] == "completed"
    assert persist_res["total_chunks"] == chunk_res["total_chunks"]
