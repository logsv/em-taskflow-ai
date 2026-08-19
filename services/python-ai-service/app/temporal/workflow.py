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
        execute_trulens_rag_triad_sweep_activity,
        evaluate_ingested_document_trulens_activity,
        run_ragas_evaluation_activity,
        run_pairwise_arena_activity,
        export_benchmark_report_activity,
        run_trace_replay_activity,
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

        # Step 4: Non-blocking TruLens Auto-Ingestion RAG Triad Evaluator
        trulens_eval_res = {}
        try:
            trulens_eval_res = await workflow.execute_activity(
                evaluate_ingested_document_trulens_activity,
                {"filename": persist_result["filename"]},
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
        except Exception:
            pass

        return {
            "status": "completed",
            "filename": persist_result["filename"],
            "total_chunks": persist_result["total_chunks"],
            "trulens_evaluated": trulens_eval_res.get("success", False),
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


@workflow.defn
class TruLensBatchEvaluationWorkflow:
    """Durable Batch TruLens RAG Triad Evaluation Workflow."""

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_interval=timedelta(seconds=15),
            maximum_attempts=3,
        )

        res = await workflow.execute_activity(
            execute_trulens_rag_triad_sweep_activity,
            params,
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(minutes=3),
            retry_policy=retry_policy,
        )

        return res


@workflow.defn
class DeepEvaluationBenchmarkWorkflow:
    """Durable Multi-Metric Deep Evaluation Benchmark Workflow (Ragas + TruLens + Arena + Langfuse)."""

    def __init__(self):
        self._current_phase = "initialized"
        self._phase_progress = {}

    @workflow.query
    def get_progress(self) -> Dict[str, Any]:
        return {
            "current_phase": self._current_phase,
            "phase_progress": self._phase_progress,
        }

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        model_name = params.get("model_name", "hermes3:8b")
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_interval=timedelta(seconds=15),
            maximum_attempts=3,
        )

        # Phase 1: Ragas Multi-Metric Evaluation
        self._current_phase = "ragas_metrics"
        ragas_scores = await workflow.execute_activity(
            run_ragas_evaluation_activity,
            {"model_name": model_name, "sync_to_langfuse": True},
            start_to_close_timeout=timedelta(minutes=5),
            heartbeat_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )
        self._phase_progress["ragas"] = ragas_scores

        # Phase 2: TruLens RAG Triad Recording
        self._current_phase = "trulens_rag_triad"
        trulens_res = await workflow.execute_activity(
            execute_trulens_rag_triad_sweep_activity,
            {"model_name": model_name, "limit": params.get("trulens_limit", 5)},
            start_to_close_timeout=timedelta(minutes=10),
            heartbeat_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )
        self._phase_progress["trulens"] = trulens_res

        # Phase 3: Pairwise Arena Calibration
        self._current_phase = "pairwise_arena"
        arena_res = await workflow.execute_activity(
            run_pairwise_arena_activity,
            {"model_name": model_name},
            start_to_close_timeout=timedelta(minutes=5),
            heartbeat_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )
        self._phase_progress["arena"] = arena_res

        # Phase 4: Report Generation & Telemetry Export
        self._current_phase = "report_export"
        report_res = await workflow.execute_activity(
            export_benchmark_report_activity,
            {
                "model_name": model_name,
                "ragas_scores": ragas_scores,
                "trulens_res": trulens_res,
                "arena_res": arena_res,
            },
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=retry_policy,
        )
        self._current_phase = "completed"

        return {
            "status": "COMPLETED",
            "model": model_name,
            "ragas_metrics": ragas_scores,
            "trulens_status": trulens_res,
            "pairwise_arena": arena_res,
            "report": report_res,
        }


@workflow.defn
class TraceReplayWorkflow:
    """Durable Model Upgrade & Trace Replay Workflow."""

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_interval=timedelta(seconds=15),
            maximum_attempts=2,
        )

        res = await workflow.execute_activity(
            run_trace_replay_activity,
            params,
            start_to_close_timeout=timedelta(minutes=15),
            heartbeat_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )

        return res



