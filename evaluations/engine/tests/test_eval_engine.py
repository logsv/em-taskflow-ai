import pytest
from evals.dataset_loader import load_golden_dataset, load_prompt_matrix_cases
from evals.pairwise_arena import PairwiseArenaJudge
from evals.ragas_triad import run_ragas_evaluation
from temporal.activities import (
    fetch_evaluation_queries_activity,
    evaluate_prompt_batch_activity,
    run_pairwise_arena_activity,
    export_benchmark_report_activity,
    sync_evaluation_leaderboard_activity,
)


def test_dataset_loader():
    golden = load_golden_dataset()
    assert isinstance(golden, list)
    assert len(golden) > 0

    matrix = load_prompt_matrix_cases(limit=5)
    assert isinstance(matrix, list)
    assert len(matrix) == 5
    assert "prompt" in matrix[0]


def test_pairwise_arena():
    judge = PairwiseArenaJudge(model_name="hermes3:8b")
    res = judge.evaluate({
        "candidate_a": "### 📄 Executive Summary\nP0 incident SLA is 5 mins.",
        "candidate_b": "5 mins",
    })
    assert res["winner"] in ["candidate_a", "candidate_b", "TIE"]
    assert res["position_bias_mitigated"] is True


def test_ragas_evaluation_local():
    scores = run_ragas_evaluation(sync_to_langfuse=False)
    assert "faithfulness" in scores
    assert "answer_relevancy" in scores
    assert "context_precision" in scores
    assert "context_recall" in scores
    assert scores["faithfulness"] >= 0.80


@pytest.mark.asyncio
async def test_eval_temporal_activities():
    fetch_res = await fetch_evaluation_queries_activity({"limit": 3})
    assert fetch_res["status"] == "SUCCESS"
    assert len(fetch_res["queries"]) == 3

    batch_res = await evaluate_prompt_batch_activity({
        "queries": fetch_res["queries"],
        "batch_index": 1,
        "total_batches": 1,
        "model_name": "hermes3:8b",
    })
    assert batch_res["status"] == "SUCCESS"
    assert batch_res["evaluated_count"] == 3

    arena_res = await run_pairwise_arena_activity({"model_name": "hermes3:8b"})
    assert "winner" in arena_res

    sync_res = await sync_evaluation_leaderboard_activity({"results": [batch_res], "model_name": "hermes3:8b"})
    assert sync_res["status"] == "SUCCESS"

    report_res = await export_benchmark_report_activity({
        "model_name": "hermes3:8b",
        "ragas_scores": batch_res["scores"],
        "arena_res": arena_res,
        "duration_seconds": 5.0,
    })
    assert report_res["status"] == "SUCCESS"
