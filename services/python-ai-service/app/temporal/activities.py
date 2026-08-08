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
        err_msg = f"PDF '{filename}' is a scanned or image document containing 0 selectable text characters. Please run OCR or upload a text-readable PDF."
        logger.error(f"❌ [Temporal Activity] {err_msg}")
        raise ValueError(err_msg)

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


# ==========================================
# Modular Chat File / Image Temporal Activities
# ==========================================

def _resolve_file_bytes(file_path: str, filename: str) -> bytes:
    """Helper to resolve file bytes from disk path or fallback locations."""
    target_path = file_path
    if not os.path.exists(target_path) and file_path:
        fallback_path = os.path.join("/app/data/pdfs", os.path.basename(file_path))
        if os.path.exists(fallback_path):
            target_path = fallback_path

    if os.path.exists(target_path):
        with open(target_path, "rb") as f:
            return f.read()
    return b""


@activity.defn
async def inspect_file_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity: Inspect file format, validate size, and determine routing category."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    mime_type = params.get("mime_type", "")
    try:
        activity.heartbeat("Inspecting file format and size")
    except Exception:
        pass

    file_bytes = _resolve_file_bytes(file_path, filename)
    fname_lower = filename.lower()
    m_lower = mime_type.lower()

    if fname_lower.endswith(".pdf") or "pdf" in m_lower:
        category = "pdf"
    elif fname_lower.endswith((".csv", ".tsv", ".xlsx", ".xls")) or any(k in m_lower for k in ["csv", "spreadsheet", "excel", "tab-separated"]):
        category = "tabular"
    elif fname_lower.endswith((".docx", ".doc")) or "wordprocessingml" in m_lower or "msword" in m_lower:
        category = "docx"
    elif fname_lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")) or "image/" in m_lower:
        category = "image"
    else:
        category = "text"

    logger.info(f"🔍 [Temporal Activity] File inspection complete for {filename}: category={category}, size={len(file_bytes)} bytes")
    return {
        "filename": filename,
        "file_path": file_path,
        "mime_type": mime_type,
        "category": category,
        "size_bytes": len(file_bytes),
    }


@activity.defn
async def extract_pdf_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity: Dedicated PyMuPDF text & page table extraction for PDF files."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    try:
        activity.heartbeat("Extracting PDF text via PyMuPDF")
    except Exception:
        pass

    file_bytes = _resolve_file_bytes(file_path, filename)
    res = file_processor._extract_pdf(file_bytes, filename)
    if not res.get("success") or not res.get("extracted_text"):
        err_msg = res.get("error_message") or f"PDF '{filename}' contains 0 selectable text characters. Please run OCR or upload a text-readable PDF."
        logger.error(f"❌ [Temporal Activity] {err_msg}")
        raise ValueError(err_msg)

    if len(res["extracted_text"]) > 15000:
        logger.info(f"⚡ [Temporal Activity] Document {filename} exceeds 15,000 chars ({len(res['extracted_text'])} chars). Applying LangChain summarization compression...")
        res["extracted_text"] = file_processor.summarize_with_langchain(res["extracted_text"], filename)
    return res


@activity.defn
async def extract_tabular_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity: Dedicated Pandas Markdown table extraction for CSV/Excel files."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    try:
        activity.heartbeat("Parsing tabular data into Markdown table via Pandas")
    except Exception:
        pass

    file_bytes = _resolve_file_bytes(file_path, filename)
    res = file_processor._extract_csv(file_bytes, filename)
    if res.get("extracted_text") and len(res["extracted_text"]) > 15000:
        res["extracted_text"] = file_processor.summarize_with_langchain(res["extracted_text"], filename)
    return res


@activity.defn
async def extract_docx_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity: Dedicated python-docx structure extraction for Word documents."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    try:
        activity.heartbeat("Extracting Word document paragraphs and tables")
    except Exception:
        pass

    file_bytes = _resolve_file_bytes(file_path, filename)
    res = file_processor._extract_docx(file_bytes, filename)
    if res.get("extracted_text") and len(res["extracted_text"]) > 15000:
        res["extracted_text"] = file_processor.summarize_with_langchain(res["extracted_text"], filename)
    return res


@activity.defn
async def extract_image_context_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity: Dedicated image metadata & vision context extraction."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    mime_type = params.get("mime_type", "")
    try:
        activity.heartbeat("Processing image attachment context")
    except Exception:
        pass

    file_bytes = _resolve_file_bytes(file_path, filename)
    res = file_processor._extract_image(file_bytes, filename, mime_type)
    return res


@activity.defn
async def extract_text_fallback_activity(params: Dict[str, Any]) -> Dict[str, Any]:
    """Activity: UTF-8 / Latin-1 text decoder for TXT, MD, JSON, and log files."""
    file_path = params.get("file_path", "")
    filename = params.get("filename", "")
    try:
        activity.heartbeat("Decoding plain text / Markdown content")
    except Exception:
        pass

    file_bytes = _resolve_file_bytes(file_path, filename)
    res = file_processor._extract_text_fallback(file_bytes, filename)
    if res.get("extracted_text") and len(res["extracted_text"]) > 15000:
        res["extracted_text"] = file_processor.summarize_with_langchain(res["extracted_text"], filename)
    return res

