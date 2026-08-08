"""
Unit & Integration Tests for RAGDatabaseService (database.py)
"""

from app.services.rag_processor.database import RAGDatabaseService


def test_db_upsert_and_hybrid_search():
    db = RAGDatabaseService()
    filename = "test_policy.pdf"
    chunks = [
        {
            "chunk_index": 0,
            "content": "EM TaskFlow AI engineering guidelines and local LLM performance standards.",
            "parent_content": "Full section on engineering standards",
            "token_count": 15,
        },
        {
            "chunk_index": 1,
            "content": "Remote work policy allows team members to work flexibly from any location.",
            "parent_content": "Full section on remote work policy",
            "token_count": 14,
        },
    ]

    # Test upsert
    success = db.upsert_chunks(filename, chunks)
    assert success is True

    # Test hybrid search
    results = db.hybrid_search("engineering standards", top_k=2)
    assert len(results) > 0
    assert "TaskFlow AI" in results[0]["content"]

    # Test listing documents
    docs = db.list_documents()
    doc_filenames = [d["filename"] for d in docs]
    assert filename in doc_filenames

    # Test deleting document
    deleted_count = db.delete_document(filename)
    assert deleted_count >= 1

    # Verify deleted
    docs_after = db.list_documents()
    doc_filenames_after = [d["filename"] for d in docs_after]
    assert filename not in doc_filenames_after
