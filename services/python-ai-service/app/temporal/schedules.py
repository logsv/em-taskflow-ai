import logging
from datetime import timedelta
from typing import Dict, Any, Optional
from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleSpec,
    SchedulePolicy,
    ScheduleOverlapPolicy,
    ScheduleAlreadyRunningError,
)

from app.temporal.workflow import DeepEvaluationBenchmarkWorkflow

logger = logging.getLogger(__name__)

NIGHTLY_BENCHMARK_SCHEDULE_ID = "nightly-deep-benchmark-schedule"
TASK_QUEUE = "rag-ingest-queue"


async def ensure_nightly_benchmark_schedule(
    client: Client,
    cron_expression: str = "0 2 * * *",
    model_name: str = "hermes3:8b",
) -> Dict[str, Any]:
    """
    Idempotently creates or verifies the nightly deep evaluation benchmark schedule.
    Runs daily at 02:00 UTC with ScheduleOverlapPolicy.SKIP.
    """
    schedule_id = NIGHTLY_BENCHMARK_SCHEDULE_ID
    logger.info(f"⏳ Checking Temporal Schedule: '{schedule_id}' (Cron: '{cron_expression}')...")

    schedule = Schedule(
        action=ScheduleActionStartWorkflow(
            DeepEvaluationBenchmarkWorkflow.run,
            {
                "model_name": model_name,
                "sync_to_langfuse": True,
                "trulens_limit": 5,
            },
            id=f"nightly-deep-benchmark-run",
            task_queue=TASK_QUEUE,
        ),
        spec=ScheduleSpec(
            cron_expressions=[cron_expression],
        ),
        policy=SchedulePolicy(
            overlap=ScheduleOverlapPolicy.SKIP,
            catchup_window=timedelta(hours=1),
        ),
    )

    try:
        handle = await client.create_schedule(
            schedule_id,
            schedule,
        )
        logger.info(f"✅ Successfully registered Temporal Schedule: '{schedule_id}'")
        return {
            "status": "CREATED",
            "schedule_id": schedule_id,
            "cron": cron_expression,
        }
    except ScheduleAlreadyRunningError:
        logger.info(f"ℹ️ Temporal Schedule '{schedule_id}' already active.")
        return {
            "status": "ALREADY_EXISTS",
            "schedule_id": schedule_id,
            "cron": cron_expression,
        }
    except Exception as e:
        logger.warning(f"⚠️ Could not register Temporal Schedule '{schedule_id}': {e}")
        return {
            "status": "ERROR",
            "schedule_id": schedule_id,
            "error": str(e),
        }


async def trigger_schedule_now(client: Client, schedule_id: str = NIGHTLY_BENCHMARK_SCHEDULE_ID) -> Dict[str, Any]:
    """Manually triggers an immediate execution of a registered schedule."""
    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.trigger()
        logger.info(f"🚀 Triggered immediate execution for schedule: '{schedule_id}'")
        return {"status": "TRIGGERED", "schedule_id": schedule_id}
    except Exception as e:
        logger.warning(f"⚠️ Failed to trigger schedule '{schedule_id}': {e}")
        return {"status": "ERROR", "schedule_id": schedule_id, "error": str(e)}


async def pause_schedule(client: Client, schedule_id: str = NIGHTLY_BENCHMARK_SCHEDULE_ID, note: str = "Paused via API") -> Dict[str, Any]:
    """Pauses a registered schedule."""
    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.pause(note=note)
        logger.info(f"⏸️ Paused schedule: '{schedule_id}'")
        return {"status": "PAUSED", "schedule_id": schedule_id}
    except Exception as e:
        logger.warning(f"⚠️ Failed to pause schedule '{schedule_id}': {e}")
        return {"status": "ERROR", "schedule_id": schedule_id, "error": str(e)}


async def unpause_schedule(client: Client, schedule_id: str = NIGHTLY_BENCHMARK_SCHEDULE_ID, note: str = "Resumed via API") -> Dict[str, Any]:
    """Resumes a paused schedule."""
    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.unpause(note=note)
        logger.info(f"▶️ Unpaused schedule: '{schedule_id}'")
        return {"status": "UNPAUSED", "schedule_id": schedule_id}
    except Exception as e:
        logger.warning(f"⚠️ Failed to unpause schedule '{schedule_id}': {e}")
        return {"status": "ERROR", "schedule_id": schedule_id, "error": str(e)}


async def get_schedule_description(client: Client, schedule_id: str = NIGHTLY_BENCHMARK_SCHEDULE_ID) -> Dict[str, Any]:
    """Retrieves live description and next run times for a registered schedule."""
    try:
        handle = client.get_schedule_handle(schedule_id)
        desc = await handle.describe()
        next_run_times = [t.isoformat() for t in (desc.info.next_action_times or [])]
        recent_actions = [
            {"action_time": a.actual_time.isoformat() if a.actual_time else None}
            for a in (desc.info.recent_actions or [])
        ]
        return {
            "status": "SUCCESS",
            "schedule_id": schedule_id,
            "paused": desc.schedule.state.paused if hasattr(desc.schedule.state, "paused") else False,
            "next_action_times": next_run_times,
            "num_actions": desc.info.num_actions,
            "recent_actions": recent_actions,
        }
    except Exception as e:
        return {"status": "ERROR", "schedule_id": schedule_id, "error": str(e)}
