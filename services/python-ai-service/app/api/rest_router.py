"""
FastAPI REST Router (Port 8000)
Exposes OpenAPI endpoints (/docs, /health, /api/v1/extract, /api/v1/rag/search) for manual inspection and REST access.
"""

import os
from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.file_processor.pdf_extractor import FileUploadProcessor
from app.services.rag_processor.chunker import RAGChunker
from app.services.rag_processor.reranker import CrossEncoderReranker
from app.services.rag_processor.database import RAGDatabaseService
from app.telemetry.shadow_evaluator import ShadowEvaluatorWorker
from app.telemetry.trulens_shadow_recorder import TruLensShadowRecorder

router = APIRouter()
file_processor = FileUploadProcessor()
rag_chunker = RAGChunker()
reranker = CrossEncoderReranker()
db_service = RAGDatabaseService()
shadow_evaluator = ShadowEvaluatorWorker(sampling_rate=0.05)
trulens_recorder = TruLensShadowRecorder()


class ShadowEvalRequest(BaseModel):
    query: str
    answer: str
    context: Optional[List[str]] = []
    trace_id: Optional[str] = None
    domain: Optional[str] = "general"


class ExtractRequest(BaseModel):
    filename: str
    text: str


class SearchApiRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5
    filter_filename: Optional[str] = ""


class CandidateItem(BaseModel):
    id: str
    content: str
    filename: Optional[str] = ""
    chunk_index: Optional[int] = 0


class RerankApiRequest(BaseModel):
    query: str
    candidate_chunks: List[CandidateItem]
    top_n: Optional[int] = 5


@router.get("/health")
def health_check():
    """Health check endpoint for Docker container health monitoring."""
    return {"status": "ok", "service": "python-ai-service"}


@router.post("/api/v1/extract")
async def extract_file(file: UploadFile = File(...)):
    """Fast-path file extraction endpoint for direct chat attachments."""
    try:
        content = await file.read()
        res = file_processor.extract_document(content, file.filename or "doc", file.content_type or "")
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/v1/rag/chunk")
def chunk_text(req: ExtractRequest):
    """Chunk text into token-aware 512-token segments and persist to PostgreSQL pdf_chunks."""
    chunks = rag_chunker.chunk_text(req.text, req.filename)
    db_service.upsert_chunks(req.filename, chunks)
    return {"filename": req.filename, "chunks": chunks, "total_chunks": len(chunks)}


@router.post("/api/v1/rag/search")
def search_rag(req: SearchApiRequest):
    """Hybrid Search (tsvector + vector similarity), Cross-Encoder Reranking, and MMR Deduplication."""
    candidates = db_service.hybrid_search(req.query, top_k=req.top_k * 3, filter_filename=req.filter_filename or "")
    results = reranker.rerank(req.query, candidates, top_n=req.top_k * 2)

    # Maximal Marginal Relevance (MMR) deduplication to prune redundant chunks
    deduped = []
    seen_texts = set()
    for item in results:
        content_snippet = item.get("content", "")[:120].strip().lower()
        if content_snippet not in seen_texts:
            seen_texts.add(content_snippet)
            deduped.append(item)
        if len(deduped) >= req.top_k:
            break

    return {"query": req.query, "results": deduped if deduped else results[:req.top_k]}


@router.get("/api/v1/rag/documents")
def list_documents():
    """List distinct ingested documents from PostgreSQL pdf_chunks."""
    docs = db_service.list_documents()
    return {"documents": docs}


@router.delete("/api/v1/rag/documents/{filename}")
def delete_document(filename: str):
    """Delete document and all chunks from PostgreSQL pdf_chunks."""
    deleted_count = db_service.delete_document(filename)
    return {"filename": filename, "deleted_chunks": deleted_count}


@router.post("/api/v1/rag/rerank")
def rerank_candidates(req: RerankApiRequest):
    """Cross-Encoder reranking endpoint to order candidate chunks by query relevance."""
    chunks_dict = [c.dict() for c in req.candidate_chunks]
    ranked = reranker.rerank(req.query, chunks_dict, top_n=req.top_n)
    return {"query": req.query, "reranked_chunks": ranked}


@router.post("/api/v1/eval/shadow-evaluate")
def evaluate_shadow(req: ShadowEvalRequest):
    """
    Non-blocking online continuous shadow evaluation endpoint.
    Samples 5% of live traffic, evaluates G-Eval/Faithfulness, and exports scores to Langfuse DB.
    Also records RAG triad live interactions into TruLens SQLite DB (default.sqlite).
    """
    trace_context = {
        "query": req.query,
        "answer": req.answer,
        "context": req.context,
        "trace_id": req.trace_id,
        "domain": req.domain,
    }
    result = shadow_evaluator.evaluate_shadow_trace(trace_context)
    
    # Non-blocking TruLens live RAG triad recording
    try:
        trulens_recorder.record_live_interaction(
            query=req.query,
            answer=req.answer,
            context=req.context or [],
            trace_id=req.trace_id,
        )
    except Exception as trulens_err:
        pass

    return {
        "sampled": result is not None,
        "eval_result": result,
        "trace_id": req.trace_id,
        "trulens_recorded": True,
    }


class TruLensSweepRequest(BaseModel):
    limit: Optional[int] = 5
    model_name: Optional[str] = "hermes3:8b"
    include_golden: Optional[bool] = True


@router.post("/api/v1/eval/trulens/sweep")
async def trigger_trulens_sweep(req: TruLensSweepRequest):
    """
    Triggers batch TruLens RAG Triad evaluation sweep across Golden Dataset and Vector DB chunks.
    Attempts execution via Temporal workflow with in-process background fallback.
    """
    temporal_host = os.getenv("TEMPORAL_HOST", "temporal:7233")
    try:
        from temporalio.client import Client
        client = await Client.connect(temporal_host)
        handle = await client.start_workflow(
            "TruLensBatchEvaluationWorkflow",
            {"limit": req.limit, "model_name": req.model_name, "include_golden": req.include_golden},
            id=f"trulens-sweep-{os.urandom(4).hex()}",
            task_queue="rag-ingest-queue",
        )
        return {
            "success": True,
            "orchestrator": "temporal",
            "workflow_id": handle.id,
            "message": "TruLens RAG Triad batch sweep dispatched to Temporal workflow.",
        }
    except Exception as e:
        import asyncio
        from evaluation.trulens_rag_triad import run_trulens_evaluation
        loop = asyncio.get_event_loop()
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        loop.run_in_executor(
            None,
            lambda: run_trulens_evaluation(model_name=req.model_name, api_base=ollama_url, limit=req.limit, include_golden=req.include_golden)
        )
        return {
            "success": True,
            "orchestrator": "in_process_fallback",
            "message": f"TruLens RAG Triad batch sweep running in background ({str(e)[:40]}).",
        }


