"""
Langfuse Score Exporter
Exports normalized evaluation scores and metrics to the dedicated Langfuse analytics DB (:5433 / :3001).
"""

import os
import logging
from typing import Dict, Any

logger = logging.getLogger("langfuse_exporter")


def export_scores_to_langfuse(
    experiment_name: str,
    scores: Dict[str, float],
    metadata: Dict[str, Any] = None,
) -> bool:
    """Flushes evaluation scores into Langfuse traces asynchronously without blocking."""
    try:
        from langfuse import Langfuse
        host = os.getenv("LANGFUSE_HOST", "http://localhost:3001")
        public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
        secret_key = os.getenv("LANGFUSE_SECRET_KEY")

        langfuse = Langfuse(public_key=public_key, secret_key=secret_key, host=host)

        trace = langfuse.trace(
            name=experiment_name,
            user_id="evaluation_engine",
            metadata=metadata or {},
        )

        for score_name, score_val in scores.items():
            langfuse.score(
                trace_id=trace.id,
                name=score_name,
                value=float(score_val),
                comment=f"Modular Evaluation Metric: {score_name}",
            )

        langfuse.flush()
        logger.info(f"🚀 Flushed {len(scores)} scores for '{experiment_name}' to Langfuse DB!")
        return True
    except Exception as e:
        logger.warning(f"⚠️ Langfuse score export skipped (non-blocking): {e}")
        return False
