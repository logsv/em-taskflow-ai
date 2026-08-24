"""
Temporal Worker for Evaluation Engine
Listens on task queue 'eval-task-queue' to process Prompt Matrix & Deep Benchmark workflows.
"""

import os
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

from temporal.workflows import (
    PromptEvaluationWorkflow,
    DeepEvaluationBenchmarkWorkflow,
)
from temporal.activities import (
    fetch_evaluation_queries_activity,
    evaluate_prompt_batch_activity,
    sync_evaluation_leaderboard_activity,
    run_ragas_evaluation_activity,
    run_pairwise_arena_activity,
    export_benchmark_report_activity,
)

logger = logging.getLogger("eval_temporal_worker")

EVAL_TASK_QUEUE = os.getenv("TEMPORAL_EVAL_TASK_QUEUE", "eval-task-queue")


async def start_evaluation_worker():
    """Connect to Temporal Server and start evaluation worker loop."""
    temporal_host = os.getenv("TEMPORAL_HOST", "localhost:7233")
    logger.info(f"⏳ Connecting Evaluation Worker to host: {temporal_host} (Queue: '{EVAL_TASK_QUEUE}')...")

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
        logger.warning(f"⚠️ Could not connect to Temporal Server at {temporal_host}. Eval Worker disabled.")
        return

    worker = Worker(
        client,
        task_queue=EVAL_TASK_QUEUE,
        identity=f"em-taskflow-eval-worker@{os.uname().nodename}",
        max_concurrent_activities=2,  # Bounded concurrency for Apple Silicon Metal
        workflows=[
            PromptEvaluationWorkflow,
            DeepEvaluationBenchmarkWorkflow,
        ],
        activities=[
            fetch_evaluation_queries_activity,
            evaluate_prompt_batch_activity,
            sync_evaluation_leaderboard_activity,
            run_ragas_evaluation_activity,
            run_pairwise_arena_activity,
            export_benchmark_report_activity,
        ],
    )

    logger.info(f"🚀 Evaluation Worker listening on Task Queue: '{EVAL_TASK_QUEUE}' (Max Concurrency: 2)")
    await worker.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(start_evaluation_worker())
