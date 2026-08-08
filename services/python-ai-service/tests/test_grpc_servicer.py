"""
Integration Tests for gRPC AIServiceServicer
"""

from app.grpc_server.ai_service_grpc import AIServiceServicer


class MockGrpcRequest:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_grpc_extract_document(sample_pdf_bytes):
    servicer = AIServiceServicer()
    req = MockGrpcRequest(filename="sample.pdf", mime_type="application/pdf", file_bytes=sample_pdf_bytes)
    
    res = servicer.ExtractDocument(req, None)
    
    assert res.success is True
    assert res.filename == "sample.pdf"
    assert res.page_count == 2
    assert "TaskFlow AI" in res.extracted_text


def test_grpc_process_rag_ingestion(sample_text_content):
    servicer = AIServiceServicer()
    req = MockGrpcRequest(filename="sample.pdf", text_content=sample_text_content, chunk_size=512, chunk_overlap=64)
    
    res = servicer.ProcessRAGIngestion(req, None)
    
    assert res.success is True
    assert res.filename == "sample.pdf"
    assert res.total_chunks > 0
    assert len(res.chunks) == res.total_chunks


def test_grpc_rerank_chunks():
    servicer = AIServiceServicer()
    c1 = MockGrpcRequest(id="c1", content="Random text content", filename="doc.pdf", chunk_index=0)
    c2 = MockGrpcRequest(id="c2", content="Cross-Encoder Reranking reduces hallucination", filename="doc.pdf", chunk_index=1)
    
    req = MockGrpcRequest(query="Cross-Encoder Reranking", candidate_chunks=[c1, c2], top_n=2)
    
    res = servicer.RerankChunks(req, None)
    
    assert res.success is True
    assert len(res.reranked_chunks) > 0
    assert res.reranked_chunks[0].id == "c2"
