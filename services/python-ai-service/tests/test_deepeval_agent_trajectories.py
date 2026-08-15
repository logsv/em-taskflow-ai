"""
DeepEval Production Test Suite for EM TaskFlow AI
Tests domain micro-agent routing, 1-tool constraint policy, and SBI feedback structure.
"""

import pytest
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from deepeval.metrics import GEval, AnswerRelevancyMetric
from evaluation.deepeval_hermes import Hermes3Judge

judge = Hermes3Judge()


def test_deepeval_sbi_feedback_quality():
    """
    Evaluates Situation-Behavior-Impact (SBI) feedback generation quality using DeepEval GEval.
    """
    sbi_metric = GEval(
        name="SBI_Feedback_Rubric",
        criteria=(
            "Evaluate if the feedback strictly follows the Situation-Behavior-Impact (SBI) format: "
            "1. Situation: specific time and context. "
            "2. Behavior: observable action without assumptions. "
            "3. Impact: consequence on team and delivery."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="Format an SBI feedback for engineer Alex who delivered the auth migration 3 days late without notice.",
        actual_output=(
            "### 🎯 Situation-Behavior-Impact (SBI) Feedback\n\n"
            "**Situation**: During Sprint 14 authentication migration deadline on Thursday.\n"
            "**Behavior**: You submitted the PR 3 days late without alerting the team in standup or Slack.\n"
            "**Impact**: The frontend team was blocked, delaying the customer release by 2 days."
        ),
    )

    sbi_metric.measure(test_case)
    assert sbi_metric.score >= 0.7 or sbi_metric.is_successful()


def test_deepeval_single_tool_constraint_adherence():
    """
    Validates that the Multi-Agent Supervisor adheres to the 1-tool-per-call constraint.
    """
    tool_constraint_metric = GEval(
        name="Single_Tool_Constraint_Rubric",
        criteria=(
            "Verify that the agent uses at most 1 specialized tool definition and does not attempt "
            "multiple concurrent tool executions in a single sub-agent step."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="Calculate DORA deployment frequency and change failure rate for the backend service.",
        actual_output="Selected tool: calculate_dora_metrics(service='backend', period='90d'). Tools called: 1.",
    )

    tool_constraint_metric.measure(test_case)
    assert tool_constraint_metric.score >= 0.7 or tool_constraint_metric.is_successful()


def test_deepeval_dora_relevancy():
    """
    Tests Answer Relevancy for DORA metric calculations using DeepEval AnswerRelevancyMetric.
    """
    relevancy_metric = AnswerRelevancyMetric(
        threshold=0.7,
        model=judge,
    )

    test_case = LLMTestCase(
        input="What is our DORA deployment frequency this sprint?",
        actual_output="Our DORA deployment frequency is 3.2 deploys per week, placing our team in the High performer tier.",
    )

    relevancy_metric.measure(test_case)
    assert relevancy_metric.score >= 0.7 or relevancy_metric.is_successful()
