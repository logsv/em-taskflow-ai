"""
Temporal Workflow for RAG Document Ingestion
Orchestrates text extraction, token chunking, Ollama vector generation, and PostgreSQL persistence with durable execution.
"""

from datetime import timedelta
from typing import Dict, Any
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import (
        extract_text_activity,
        chunk_text_activity,
        persist_and_embed_activity,
        inspect_file_activity,
        extract_pdf_activity,
        extract_tabular_activity,
        extract_docx_activity,
        extract_image_context_activity,
        extract_text_fallback_activity,
    )


@workflow.defn
class RAGIngestWorkflow:
    """Durable RAG Ingestion Workflow."""

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=10),
            maximum_attempts=3,
        )

        # Step 1: Extract Text
        extract_result = await workflow.execute_activity(
            extract_text_activity,
            params,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )

        # Step 2: Chunk Text
        chunk_params = {
            "filename": extract_result["filename"],
            "text": extract_result["text"],
        }
        chunk_result = await workflow.execute_activity(
            chunk_text_activity,
            chunk_params,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )

        # Step 3: Embed Vectors & Persist to PostgreSQL
        persist_params = {
            "filename": chunk_result["filename"],
            "chunks": chunk_result["chunks"],
        }
        persist_result = await workflow.execute_activity(
            persist_and_embed_activity,
            persist_params,
            start_to_close_timeout=timedelta(seconds=120),
            retry_policy=retry_policy,
        )

        return {
            "status": "completed",
            "filename": persist_result["filename"],
            "total_chunks": persist_result["total_chunks"],
        }


@workflow.defn
class ChatFileExtractWorkflow:
    """Durable Modular Chat File / Image Extraction Workflow (No Database Writes)."""

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=10),
            maximum_attempts=3,
        )

        # Step 1: Modular Activity 1 - Inspect File Format & Category
        inspect_res = await workflow.execute_activity(
            inspect_file_activity,
            params,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )

        category = inspect_res.get("category", "text")
        filename = inspect_res.get("filename", "file")
        file_params = {
            "file_path": inspect_res.get("file_path", ""),
            "filename": filename,
            "mime_type": inspect_res.get("mime_type", ""),
        }

        # Step 2: Dynamically route to specialized modular extraction activity
        if category == "pdf":
            ext_res = await workflow.execute_activity(
                extract_pdf_activity,
                file_params,
                start_to_close_timeout=timedelta(seconds=90),
                retry_policy=retry_policy,
            )
        elif category == "tabular":
            ext_res = await workflow.execute_activity(
                extract_tabular_activity,
                file_params,
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=retry_policy,
            )
        elif category == "docx":
            ext_res = await workflow.execute_activity(
                extract_docx_activity,
                file_params,
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=retry_policy,
            )
        elif category == "image":
            ext_res = await workflow.execute_activity(
                extract_image_context_activity,
                file_params,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=retry_policy,
            )
        else:
            ext_res = await workflow.execute_activity(
                extract_text_fallback_activity,
                file_params,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=retry_policy,
            )

        return {
            "status": "completed",
            "filename": filename,
            "category": category,
            "extracted_text": ext_res.get("extracted_text", ""),
            "page_count": ext_res.get("page_count", 1),
            "extraction_method": ext_res.get("extraction_method", "none"),
        }

