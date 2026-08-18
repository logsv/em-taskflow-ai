import pytest
from app.temporal.activities import (
    extract_text_activity,
    chunk_text_activity,
    persist_and_embed_activity,
    run_pairwise_arena_activity,
    export_benchmark_report_activity,
    evaluate_ingested_document_trulens_activity,
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

    # Test activity 4: Pairwise Arena Activity
    arena_res = await run_pairwise_arena_activity({
        "model_name": "hermes3:8b",
        "candidate_a": "### 📄 Executive Summary\nP0 SLA is 5 mins.",
        "candidate_b": "Acknowledge in 5m.",
    })
    assert "winner" in arena_res

    # Test activity 5: Ingestion TruLens Evaluator (non-blocking)
    eval_doc_res = await evaluate_ingested_document_trulens_activity({"filename": "test_sop.pdf"})
    assert eval_doc_res["filename"] == "test_sop.pdf"

    # Test activity 6: Export Benchmark Report
    report_res = await export_benchmark_report_activity({
        "model_name": "hermes3:8b",
        "ragas_scores": {"faithfulness": 1.0, "answer_relevance": 1.0},
        "trulens_res": {"records_evaluated": 2},
        "arena_res": arena_res,
        "duration_seconds": 12.5,
    })
    assert report_res["status"] == "SUCCESS"
    assert "report_path" in report_res

