"""
Temporal Activities for RAG Document Ingestion
Each activity executes a single discrete step of the RAG ingestion pipeline.
"""

import os
import logging
from typing import Dict, Any, List
from temporalio import activity

from app.services.file_processor.pdf_extractor import FileUploadProcessor
from app.services.rag_processor.chunker import RAGChunker
from app.services.rag_processor.database import RAGDatabaseService

logger = logging.getLogger(__name__)
file_processor = FileUploadProcessor()
rag_chunker = RAGChunker()
db_service = RAGDatabaseService()


@activity.defn
async def extract_text_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity 1: Extract text from multi-format files (PDF, CSV, Word, Text)."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    try:
        activity.heartbeat("Extracting text from file")
    except Exception:
        pass
    
    logger.info(f"📄 [Temporal Activity] Extracting text for {filename} ({file_path})")
    
    target_path = file_path
    if not os.path.exists(target_path) and file_path:
        fallback_path = os.path.join("/app/data/pdfs", os.path.basename(file_path))
        if os.path.exists(fallback_path):
            target_path = fallback_path

    if os.path.exists(target_path):
        with open(target_path, "rb") as f:
            file_bytes = f.read()
        extracted_text = file_processor.extract_text(file_bytes, filename)
    else:
        logger.warning(f"⚠️ [Temporal Activity] File not found at path: {file_path} or target_path: {target_path}")
        extracted_text = params.get("text", "")

    if not extracted_text or not extracted_text.strip():
        raise ValueError(f"No text content could be extracted from {filename} (path: {target_path})")

    return {
        "filename": filename,
        "text": extracted_text,
        "length": len(extracted_text)
    }


@activity.defn
async def chunk_text_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity 2: Chunk extracted text into 512-token parent-child windows."""
    filename = params.get("filename", "")
    text = params.get("text", "")
    try:
        activity.heartbeat("Chunking text into 512-token windows")
    except Exception:
        pass

    logger.info(f"✂️ [Temporal Activity] Chunking text for {filename}")
    chunks = rag_chunker.chunk_text(text, filename)
    
    return {
        "filename": filename,
        "chunks": chunks,
        "total_chunks": len(chunks)
    }


@activity.defn
async def persist_and_embed_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity 3: Compute Ollama vector embeddings & upsert chunks into PostgreSQL."""
    filename = params.get("filename", "")
    chunks = params.get("chunks", [])
    try:
        activity.heartbeat("Generating vector embeddings & upserting to PostgreSQL")
    except Exception:
        pass

    logger.info(f"🗄️ [Temporal Activity] Upserting {len(chunks)} chunks into PostgreSQL for {filename}")
    success = db_service.upsert_chunks(filename, chunks)
    
    if not success:
        raise RuntimeError(f"Failed to upsert chunks into PostgreSQL for {filename}")

    return {
        "filename": filename,
        "total_chunks": len(chunks),
        "status": "completed"
    }
