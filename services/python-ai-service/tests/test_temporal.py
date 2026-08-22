import pytest
from app.temporal.activities import (
    extract_text_activity,
    chunk_text_activity,
    persist_and_embed_activity,
    run_pairwise_arena_activity,
    export_benchmark_report_activity,
    fetch_evaluation_queries_activity,
    evaluate_single_rag_triad_query_activity,
    evaluate_prompt_batch_activity,
    sync_evaluation_leaderboard_activity,
)


@pytest.mark.asyncio
async def test_temporal_activities():
    # Test activity 1: Extract Text (direct text parameter)
    extract_res = await extract_text_activity({"filename": "test.txt", "text": "Sample temporal text content"})
    assert extract_res["filename"] == "test.txt"
    assert extract_res["text"] == "Sample temporal text content"

    # Test activity 2: Chunk Text
    chunk_res = await chunk_text_activity({"filename": "test.txt", "text": extract_res["text"]})
    assert chunk_res["filename"] == "test.txt"
    assert chunk_res["total_chunks"] > 0

    # Test activity 3: Persist & Embed
    persist_res = await persist_and_embed_activity({"filename": "test.txt", "chunks": chunk_res["chunks"]})
    assert persist_res["status"] == "completed"
    assert persist_res["total_chunks"] == chunk_res["total_chunks"]

    # Test activity 4: Pairwise Arena Activity
    arena_res = await run_pairwise_arena_activity({
        "model_name": "hermes3:8b",
        "candidate_a": "### 📄 Executive Summary\nP0 SLA is 5 mins.",
        "candidate_b": "Acknowledge in 5m.",
    })
    assert "winner" in arena_res

    # Test activity 5: Export Benchmark Report
    report_res = await export_benchmark_report_activity({
        "model_name": "hermes3:8b",
        "ragas_scores": {"faithfulness": 1.0, "answer_relevance": 1.0},
        "arena_res": arena_res,
        "duration_seconds": 12.5,
    })
    assert report_res["status"] == "SUCCESS"
    assert "report_path" in report_res

    # Test activity 6: Granular Query Fetch Activity
    fetch_res = await fetch_evaluation_queries_activity({"limit": 2, "include_golden": True})
    assert fetch_res["status"] == "SUCCESS"
    assert len(fetch_res["queries"]) > 0

    # Test activity 7: Granular Single Query Evaluation Activity
    eval_single_res = await evaluate_single_rag_triad_query_activity({
        "query": "What is the engineering escalation protocol for P0 incidents?",
        "query_index": 1,
        "total_queries": 1,
        "model_name": "hermes3:8b",
    })
    assert eval_single_res["status"] == "SUCCESS"
    assert "feedbacks" in eval_single_res
    assert "faithfulness" in eval_single_res["feedbacks"]

    # Test activity 8: Prompt Batch Evaluation Activity
    eval_batch_res = await evaluate_prompt_batch_activity({
        "queries": ["What is the SLA for P0 incidents?"],
        "batch_index": 1,
        "total_batches": 1,
        "model_name": "hermes3:8b",
    })
    assert eval_batch_res["status"] == "SUCCESS"
    assert eval_batch_res["evaluated_count"] == 1

    # Test activity 9: Leaderboard Sync Activity
    sync_res = await sync_evaluation_leaderboard_activity({
        "results": [eval_single_res],
        "model_name": "hermes3:8b",
    })
    assert sync_res["status"] == "SUCCESS"
    assert sync_res["total_evaluated"] == 1
    assert "mean_scores" in sync_res


@pytest.mark.asyncio
async def test_temporal_schedules_manager():
    from unittest.mock import AsyncMock, MagicMock
    from app.temporal.schedules import (
        ensure_nightly_benchmark_schedule,
        trigger_schedule_now,
        pause_schedule,
        unpause_schedule,
        get_schedule_description,
        NIGHTLY_BENCHMARK_SCHEDULE_ID,
    )

    mock_client = MagicMock()
    mock_client.create_schedule = AsyncMock(return_value=MagicMock())
    mock_handle = MagicMock()
    mock_handle.trigger = AsyncMock()
    mock_handle.pause = AsyncMock()
    mock_handle.unpause = AsyncMock()
    mock_desc = MagicMock()
    mock_desc.info.next_action_times = []
    mock_desc.info.num_actions = 1
    mock_desc.info.recent_actions = []
    mock_desc.schedule.state.paused = False
    mock_handle.describe = AsyncMock(return_value=mock_desc)
    mock_client.get_schedule_handle = MagicMock(return_value=mock_handle)

    # 1. Ensure schedule created
    res = await ensure_nightly_benchmark_schedule(mock_client, cron_expression="0 2 * * *")
    assert res["status"] in ["CREATED", "ALREADY_EXISTS"]
    assert res["schedule_id"] == NIGHTLY_BENCHMARK_SCHEDULE_ID

    # 2. Trigger schedule
    trigger_res = await trigger_schedule_now(mock_client)
    assert trigger_res["status"] == "TRIGGERED"

    # 3. Pause & unpause schedule
    pause_res = await pause_schedule(mock_client)
    assert pause_res["status"] == "PAUSED"
    unpause_res = await unpause_schedule(mock_client)
    assert unpause_res["status"] == "UNPAUSED"

    # 4. Get description
    desc_res = await get_schedule_description(mock_client)
    assert desc_res["status"] == "SUCCESS"
    assert desc_res["num_actions"] == 1



