import os
import random
import logging
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from evaluation.llm_judge import LLMJudgeFactory

load_dotenv()

logger = logging.getLogger(__name__)

SAMPLING_RATE = 0.05  # 5% production trace sampling rate


class ShadowEvaluatorWorker:
    """
    Asynchronous non-blocking shadow evaluator for production telemetry.
    Uses official DeepEval G-Eval metric and syncs scores to Langfuse.
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
            trace_id = trace_context.get("trace_id")
            score = result.get("score", 5)
            faithfulness = result.get("faithfulness", 1.0)

            logger.info(f"📊 Shadow Evaluation completed for trace {trace_id or 'UNKNOWN'}: score={score}")

            # Non-blocking Langfuse telemetry export
            if trace_id:
                try:
                    from langfuse import Langfuse
                    host = os.getenv("LANGFUSE_HOST", "http://localhost:3001")
                    langfuse = Langfuse(
                        public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                        secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                        host=host,
                    )
                    langfuse.score(
                        trace_id=trace_id,
                        name="shadow_geval_score",
                        value=float(score) / 5.0,
                        comment=f"Shadow Evaluator G-Eval metric ({self.model_name})",
                    )
                    langfuse.score(
                        trace_id=trace_id,
                        name="shadow_faithfulness",
                        value=float(faithfulness),
                        comment=f"Shadow Evaluator Faithfulness metric ({self.model_name})",
                    )
                    if "blameless_tone" in result:
                        langfuse.score(
                            trace_id=trace_id,
                            name="shadow_blameless_tone",
                            value=float(result["blameless_tone"]),
                            comment=f"Shadow Evaluator Blameless Tone metric ({self.model_name})",
                        )
                    if "smart_actionability" in result:
                        langfuse.score(
                            trace_id=trace_id,
                            name="shadow_smart_action_adherence",
                            value=float(result["smart_actionability"]),
                            comment=f"Shadow Evaluator SMART Action Adherence ({self.model_name})",
                        )
                    langfuse.flush()
                except Exception as sync_err:
                    logger.debug(f"Shadow Langfuse score skipped: {sync_err}")

            return result
        except Exception as e:
            logger.warning(f"⚠️ Shadow Evaluation non-blocking warning: {e}")
            return None
