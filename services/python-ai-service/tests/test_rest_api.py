"""
Unit Tests for FastAPI REST Endpoints via TestClient
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "python-ai-service"


def test_rag_chunk_endpoint(sample_text_content):
    response = client.post(
        "/api/v1/rag/chunk",
        json={"filename": "doc.pdf", "text": sample_text_content}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "doc.pdf"
    assert "chunks" in data
    assert data["total_chunks"] > 0


def test_rag_rerank_endpoint():
    payload = {
        "query": "Cross-Encoder",
        "candidate_chunks": [
            {"id": "1", "content": "Weather report", "filename": "f.pdf", "chunk_index": 0},
            {"id": "2", "content": "Cross-Encoder anti hallucination", "filename": "f.pdf", "chunk_index": 1}
        ],
        "top_n": 2
    }
    response = client.post("/api/v1/rag/rerank", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "Cross-Encoder"
    assert len(data["reranked_chunks"]) > 0
    assert data["reranked_chunks"][0]["id"] == "2"


def test_shadow_evaluate_endpoint():
    payload = {
        "query": "What are DORA metrics?",
        "answer": "DORA metrics include deployment frequency, lead time for changes, MTTR, and change failure rate.",
        "context": ["DORA framework established 4 core engineering metrics."],
        "trace_id": "test_trace_123",
        "domain": "dora"
    }
    response = client.post("/api/v1/eval/shadow-evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "sampled" in data
    assert data["trace_id"] == "test_trace_123"

