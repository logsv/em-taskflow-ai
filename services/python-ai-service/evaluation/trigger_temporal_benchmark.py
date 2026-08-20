"""
CLI Trigger for Temporal Deep Evaluation Benchmark
Connects to Temporal Server to trigger 'nightly-deep-benchmark-schedule' or launch DeepEvaluationBenchmarkWorkflow.
"""

import os
import sys
import time
import asyncio
import logging
from temporalio.client import Client

from app.temporal.schedules import trigger_schedule_now, ensure_nightly_benchmark_schedule, NIGHTLY_BENCHMARK_SCHEDULE_ID
from app.temporal.workflow import DeepEvaluationBenchmarkWorkflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("temporal_benchmark_trigger")


async def main():
    host = os.getenv("TEMPORAL_HOST", "localhost:7233")
    logger.info(f"⏳ Connecting to Temporal Server at {host}...")
    try:
        client = await Client.connect(host)
    except Exception as e:
        logger.error(f"❌ Failed to connect to Temporal at {host}: {e}")
        sys.exit(1)

    # Ensure schedule exists
    await ensure_nightly_benchmark_schedule(client)

    # Trigger execution
    logger.info("🚀 Triggering execution of Nightly Deep Benchmark on Temporal...")
    res = await trigger_schedule_now(client)
    if res.get("status") == "TRIGGERED":
        logger.info(f"✅ Successfully triggered scheduled benchmark on Temporal (Schedule: {NIGHTLY_BENCHMARK_SCHEDULE_ID})")
    else:
        logger.info("⚠️ Starting DeepEvaluationBenchmarkWorkflow directly on Temporal...")
        handle = await client.start_workflow(
            DeepEvaluationBenchmarkWorkflow.run,
            {"model_name": "hermes3:8b", "sync_to_langfuse": True, "trulens_limit": 5},
            id=f"manual-deep-benchmark-{int(time.time())}",
            task_queue="rag-ingest-queue",
        )
        logger.info(f"✅ Started DeepEvaluationBenchmarkWorkflow (Workflow ID: {handle.id})")


if __name__ == "__main__":
    asyncio.run(main())
