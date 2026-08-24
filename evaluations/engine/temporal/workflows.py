"""
Temporal Workflows for Modular Evaluation Engine (TaskQueue: 'eval-task-queue')
"""

from datetime import timedelta
from typing import Dict, Any
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from temporal.activities import (
        fetch_evaluation_queries_activity,
        evaluate_prompt_batch_activity,
        sync_evaluation_leaderboard_activity,
        run_ragas_evaluation_activity,
        run_pairwise_arena_activity,
        export_benchmark_report_activity,
    )


@workflow.defn
class PromptEvaluationWorkflow:
    """Durable Prompt Matrix & RAG Triad Evaluation Workflow with Micro-Batching (5-10 items)."""

    def __init__(self):
        self._current_step = "initialized"
        self._evaluated_queries = []

    @workflow.query
    def get_status(self) -> Dict[str, Any]:
        return {
            "current_step": self._current_step,
            "evaluated_count": len(self._evaluated_queries),
            "records": self._evaluated_queries,
        }

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        limit = params.get("limit", 10)
        model_name = params.get("model_name", "hermes3:8b")
        batch_size = params.get("batch_size", 5)

        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_interval=timedelta(seconds=15),
            maximum_attempts=3,
        )

        # Step 1: Fetch evaluation queries from central dataset
        self._current_step = "fetching_queries"
        fetch_res = await workflow.execute_activity(
            fetch_evaluation_queries_activity,
            {"limit": limit, "include_golden": params.get("include_golden", True)},
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        queries = fetch_res.get("queries", [])
        total_queries = len(queries)

        # Step 2: Micro-batched evaluation (5-10 items per chunk)
        self._current_step = "evaluating_micro_batches"
        query_results = []
        for i in range(0, total_queries, batch_size):
            batch_slice = queries[i : i + batch_size]
            batch_idx = (i // batch_size) + 1
            total_batches = (total_queries + batch_size - 1) // batch_size

            batch_res = await workflow.execute_activity(
                evaluate_prompt_batch_activity,
                {
                    "queries": batch_slice,
                    "batch_index": batch_idx,
                    "total_batches": total_batches,
                    "model_name": model_name,
                },
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=60),
                retry_policy=retry_policy,
            )
            query_results.append(batch_res)
            self._evaluated_queries.extend(batch_slice)

        # Step 3: Aggregate & Sync Langfuse Leaderboard
        self._current_step = "syncing_leaderboard"
        summary = await workflow.execute_activity(
            sync_evaluation_leaderboard_activity,
            {"results": query_results, "model_name": model_name},
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        self._current_step = "completed"

        return {
            "status": "SUCCESS",
            "records_evaluated": total_queries,
            "app_id": "em-taskflow-prompt-eval",
            "model_name": model_name,
            "feedbacks": ["Faithfulness", "Answer Relevance", "Context Precision", "Context Recall"],
            "summary": summary,
            "results": query_results,
        }


@workflow.defn
class DeepEvaluationBenchmarkWorkflow:
    """Durable Multi-Metric Deep Evaluation Benchmark Workflow (Ragas + Pairwise Arena + Langfuse)."""

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

        # Phase 2: Pairwise Arena Calibration
        self._current_phase = "pairwise_arena"
        arena_res = await workflow.execute_activity(
            run_pairwise_arena_activity,
            {"model_name": model_name},
            start_to_close_timeout=timedelta(minutes=5),
            heartbeat_timeout=timedelta(seconds=60),
            retry_policy=retry_policy,
        )
        self._phase_progress["arena"] = arena_res

        # Phase 3: Report Generation & Telemetry Export
        self._current_phase = "report_export"
        report_res = await workflow.execute_activity(
            export_benchmark_report_activity,
            {
                "model_name": model_name,
                "ragas_scores": ragas_scores,
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
            "pairwise_arena": arena_res,
            "report": report_res,
        }
