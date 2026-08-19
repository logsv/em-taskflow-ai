"""
Temporal Worker for Python AI Microservice
Listens on task queue 'rag-ingest-queue' to process RAG ingestion workflows.
"""

import os
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

from app.temporal.workflow import (
    RAGIngestWorkflow,
    ChatFileExtractWorkflow,
    TruLensBatchEvaluationWorkflow,
    DeepEvaluationBenchmarkWorkflow,
    TraceReplayWorkflow,
)
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
    fetch_evaluation_queries_activity,
    evaluate_single_rag_triad_query_activity,
    sync_trulens_leaderboard_activity,
    execute_trulens_rag_triad_sweep_activity,
    evaluate_ingested_document_trulens_activity,
    run_ragas_evaluation_activity,
    run_pairwise_arena_activity,
    export_benchmark_report_activity,
    run_trace_replay_activity,
)

logger = logging.getLogger(__name__)

TASK_QUEUE = "rag-ingest-queue"


async def start_temporal_worker():
    """Connect to Temporal Server and start background worker loop."""
    temporal_host = os.getenv("TEMPORAL_HOST", "temporal:7233")
    logger.info(f"⏳ Connecting Temporal Worker to host: {temporal_host}...")

    retry_count = 0
    client = None
    while retry_count < 30:
        try:
            client = await Client.connect(temporal_host)
            logger.info(f"✅ Connected to Temporal Server at {temporal_host}")
            break
        except Exception as e:
            retry_count += 1
            logger.warning(f"⚠️ Temporal connection attempt {retry_count}/30 failed ({str(e)}). Retrying in 3s...")
            await asyncio.sleep(3)

    if not client:
        logger.warning(f"⚠️ Could not connect to Temporal Server at {temporal_host}. Temporal Worker disabled.")
        return

    # Automatically register / verify the Nightly Deep Benchmark Schedule (0 2 * * *)
    try:
        from app.temporal.schedules import ensure_nightly_benchmark_schedule
        cron_expr = os.getenv("BENCHMARK_SCHEDULE_CRON", "0 2 * * *")
        await ensure_nightly_benchmark_schedule(client, cron_expression=cron_expr)
    except Exception as sched_err:
        logger.warning(f"⚠️ Schedule registration non-blocking warning: {sched_err}")

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            RAGIngestWorkflow,
            ChatFileExtractWorkflow,
            TruLensBatchEvaluationWorkflow,
            DeepEvaluationBenchmarkWorkflow,
            TraceReplayWorkflow,
        ],
        activities=[
            extract_text_activity,
            chunk_text_activity,
            persist_and_embed_activity,
            inspect_file_activity,
            extract_pdf_activity,
            extract_tabular_activity,
            extract_docx_activity,
            extract_image_context_activity,
            extract_text_fallback_activity,
            fetch_evaluation_queries_activity,
            evaluate_single_rag_triad_query_activity,
            sync_trulens_leaderboard_activity,
            execute_trulens_rag_triad_sweep_activity,
            evaluate_ingested_document_trulens_activity,
            run_ragas_evaluation_activity,
            run_pairwise_arena_activity,
            export_benchmark_report_activity,
            run_trace_replay_activity,
        ],
    )

    logger.info(f"🚀 Temporal Worker listening on Task Queue: '{TASK_QUEUE}'")
    await worker.run()
