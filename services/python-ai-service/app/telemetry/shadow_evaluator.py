"""
Shadow Evaluation Worker (Production Telemetry)
Samples 5% of production traces asynchronously and evaluates faithfulness using hermes3:8b via LLMJudgeFactory.
"""

import random
import logging
from typing import Dict, Any, Optional
from evaluation.llm_judge import LLMJudgeFactory

logger = logging.getLogger(__name__)

SAMPLING_RATE = 0.05  # 5% production trace sampling rate


class ShadowEvaluatorWorker:
    """
    Asynchronous non-blocking shadow evaluator for production telemetry.
    """

    def __init__(self, sampling_rate: float = SAMPLING_RATE, model_name: str = "hermes3:8b"):
        self.sampling_rate = sampling_rate
        self.model_name = model_name
        self.judge = LLMJudgeFactory.create_judge("geval", model_name=model_name)

    def should_sample(self) -> bool:
        """Determines whether a trace should be sampled based on the configured rate."""
        return random.random() < self.sampling_rate

    def evaluate_shadow_trace(self, trace_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Evaluates a sampled production trace asynchronously.
        Never throws exceptions to guarantee zero downtime and non-blocking telemetry.
        """
        if not self.should_sample():
            return None

        try:
            result = self.judge.evaluate(trace_context)
            logger.info(f"📊 Shadow Evaluation completed for trace {trace_context.get('trace_id', 'UNKNOWN')}: score={result.get('score')}")
            return result
        except Exception as e:
            logger.warning(f"⚠️ Shadow Evaluation non-blocking warning: {e}")
            return None
