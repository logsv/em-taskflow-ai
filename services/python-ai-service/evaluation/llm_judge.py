"""
LLM-as-a-Judge Evaluation Engine (Factory Pattern)
Standardized on local SLM inference (the local Ollama chat model)
"""

import json
import logging
import os
from typing import Dict, Any, List, Optional
from scipy.stats import kendalltau
from app.model_config import DEFAULT_LLM_MODEL

logger = logging.getLogger(__name__)

DEFAULT_JUDGE_MODEL = DEFAULT_LLM_MODEL


class BaseLLMJudge:
    """Base class for all local LLM judges."""

    def __init__(self, model_name: str = DEFAULT_JUDGE_MODEL):
        self.model_name = model_name

    def evaluate(self, input_context: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError("Subclasses must implement evaluate()")


class GEvalSingleAnswerJudge(BaseLLMJudge):
    """
    Single-Answer G-Eval Judge
    Evaluates response faithfulness, relevance, and groundedness on a 1-5 Likert scale
    using discrete verbal anchors and Chain-of-Thought (CoT) reasoning.
    """

    COT_RUBRIC_PROMPT = """
You are an expert Engineering Manager evaluation judge.
Evaluate the candidate response based on the query and ground truth context.

Evaluation Dimensions:
1. Faithfulness & Grounding (1-5): Factual grounding in empirical data without hallucinations.
2. Blameless Psychological Safety (0.0-1.0): Focus on systemic bottlenecks and nonviolent communication (no toxic blame).
3. SMART Actionability (0.0-1.0): Actions have clear owners, target milestones, and measurable success metrics.
4. Structural Formatting: Professional Markdown tables, bullet points, and section headings.

Criteria:
1 - Very Poor: Severe hallucinations or completely off-topic.
2 - Poor: Contains partial inaccuracies or missing key constraints.
3 - Acceptable: Factually correct but lacks detail or minor formatting flaws.
4 - Good: Accurate, fully grounded, and follows structural guidelines.
5 - Excellent: Perfect synthesis, completely factual, and precise citations.

Output structured JSON:
{
  "reasoning": "<step-by-step Chain-of-Thought>",
  "score": <integer 1-5>,
  "faithfulness": <float 0.0-1.0>,
  "blameless_tone": <float 0.0-1.0>,
  "smart_actionability": <float 0.0-1.0>
}
"""

    def evaluate(self, input_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Heuristic format/tone checks. No LLM is called, so faithfulness is NOT measured here
        (it is None). A model-based judge is part of the Phase 3 evaluation harness.
        """
        response = input_context.get("response") or input_context.get("answer") or ""

        is_valid = len(response) > 20 and ("Summary" in response or "Key" in response or len(response) > 50)
        has_blameless_tone = not any(word in response.lower() for word in ["fault", "incompetent", "lazy", "blame"])
        has_smart_actions = "Owner" in response or "Action" in response or "Metric" in response or "@" in response

        return {
            "judge_model": None,
            "judge_type": "heuristic",
            "score": 5 if is_valid else 3,
            "faithfulness": None,
            "format_valid": is_valid,
            "blameless_tone": has_blameless_tone,
            "smart_actionability": has_smart_actions,
            "reasoning": "Heuristic format and tone checks only; no LLM was called, so faithfulness was not measured.",
        }


class PairwiseArenaJudge(BaseLLMJudge):
    """
    Pairwise Arena Judge with Dual-Pass Position Bias Mitigation
    Swaps Candidate A and B positions to eliminate first-option bias.
    """

    def evaluate(self, input_context: Dict[str, Any]) -> Dict[str, Any]:
        candidate_a = input_context.get("candidate_a", "")
        candidate_b = input_context.get("candidate_b", "")

        # Heuristic: prefers the longer answer. No LLM is called and no position-bias
        # mitigation happens; the result says so instead of claiming otherwise.
        if len(candidate_a) == len(candidate_b):
            winner = "TIE"
        else:
            winner = "A" if len(candidate_a) > len(candidate_b) else "B"

        return {
            "judge_model": None,
            "judge_type": "heuristic_length",
            "winner": winner,
            "position_bias_mitigated": False,
            "reasoning": "Heuristic: prefers the longer answer. No LLM was called.",
        }


class LLMJudgeFactory:
    """
    Factory Pattern for initializing LLM Judges with the local chat model.
    """

    @staticmethod
    def create_judge(judge_type: str = "geval", model_name: str = DEFAULT_JUDGE_MODEL) -> BaseLLMJudge:
        judge_type_lower = judge_type.lower()
        if judge_type_lower in ["geval", "single_answer"]:
            return GEvalSingleAnswerJudge(model_name=model_name)
        elif judge_type_lower in ["pairwise", "arena"]:
            return PairwiseArenaJudge(model_name=model_name)
        else:
            raise ValueError(f"Unknown judge type: {judge_type}. Valid options: 'geval', 'pairwise'")


def calculate_human_judge_calibration(human_scores: List[float], judge_scores: List[float]) -> Dict[str, float]:
    """
    Computes Kendall's Tau (tau) rank correlation between human expert ratings and LLM Judge scores.
    """
    if len(human_scores) < 2 or len(human_scores) != len(judge_scores):
        # Not enough paired ratings to compute a correlation; do not report a perfect one.
        return {"kendall_tau": None, "p_value": None}

    tau, p_val = kendalltau(human_scores, judge_scores)
    return {"kendall_tau": float(tau), "p_value": float(p_val)}
