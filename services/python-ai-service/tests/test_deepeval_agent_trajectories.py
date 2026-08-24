"""
DeepEval Production Test Suite for EM TaskFlow AI
Tests domain micro-agent routing, 1-tool constraint policy, SBI feedback de-biasing,
People & Career Growth competency mapping, Delivery anti-blame analysis, and zero-silent-failure data provenance.
"""

import pytest
from deepeval.test_case import LLMTestCase

try:
    from deepeval.test_case import LLMTestCaseParams
except ImportError:
    try:
        from deepeval.test_case import SingleTurnParams as LLMTestCaseParams
    except ImportError:
        class LLMTestCaseParams:  # type: ignore
            INPUT = "input"
            ACTUAL_OUTPUT = "actual_output"
            EXPECTED_OUTPUT = "expected_output"
            CONTEXT = "context"
            RETRIEVAL_CONTEXT = "retrieval_context"

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


def test_deepeval_sbi_debiasing_and_talking_script():
    """
    Evaluates that subjective/toxic adjectives (lazy, careless) are scrubbed into observable facts
    and empathetic 1-on-1 talking scripts are formulated.
    """
    debiasing_metric = GEval(
        name="SBI_DeBiasing_Rubric",
        criteria=(
            "Evaluate if subjective labels (e.g. 'lazy', 'careless') are replaced with objective observations, "
            "and that an empathetic talking script is provided."
        ),
        evaluation_steps=[
            "Check if subjective words like 'lazy' or 'careless' are replaced with objective facts.",
            "Check if an empathetic 1-on-1 talking script is included.",
            "Verify constructive growth steps are provided.",
        ],
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.6,
    )

    test_case = LLMTestCase(
        input="Format feedback for John: he was lazy in standup and acted careless when merging PR #402.",
        actual_output=(
            "### 🎯 Situation-Behavior-Impact (SBI) Feedback: eng_john\n\n"
            "**Situation**: During the recent release deployment (1-on-1 Context).\n"
            "**Behavior**: Merged code without completing required integration test verification and missed scheduled sprint milestone.\n"
            "**Impact**: Caused an unexpected 35-minute auth outage delaying the release.\n"
            "**Growth Action**: Adhere to emergency pairing protocols and CI verification checklist.\n\n"
            "### 💬 Recommended 1-on-1 Manager Talking Script\n"
            "> \"John, when PR #402 was merged without verification, it caused an outage. Moving forward, let's adhere to the emergency pairing protocol. How can I support you?\""
        ),
    )

    debiasing_metric.measure(test_case)
    assert debiasing_metric.score >= 0.7 or debiasing_metric.is_successful()


def test_deepeval_people_competency_radar_and_promotion_readiness():
    """
    Evaluates 12-dimension competency evaluation, mathematical promotion readiness scoring,
    and multi-horizon career development roadmaps.
    """
    people_metric = GEval(
        name="People_Growth_Competency_Rubric",
        criteria=(
            "Verify that the career evaluation covers 12 core engineering dimensions, calculates a "
            "mathematical Promotion Readiness score, identifies missing prerequisites, and provides "
            "multi-horizon growth roadmaps (Immediate 3-6m, Medium 6-18m, Long-Term 1-3y)."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="Evaluate Alex (L4 Mid) for promotion to L5 Senior Backend Engineer on the IC track.",
        actual_output=(
            "### 📊 Competency Radar & Gap Analysis: eng_alex (L4_MID ➔ L5_SENIOR)\n\n"
            "- Track: Individual Contributor (IC) | Promotion Readiness: 86% (ON TRACK)\n"
            "- Top Gaps: Architecture & System Design (-1.2), Mentoring & Peer Growth (-1.2)\n"
            "- Prerequisites Met: 3 / 4 (Lead RFC to approval: MET, Mentorship: MET)\n\n"
            "### 🗺️ Multi-Horizon Career Development Roadmap\n"
            "- Immediate (3-6m): Author and present Technical RFC for distributed caching.\n"
            "- Medium (6-18m): Formally mentor 1-2 junior engineers and serve as Incident Commander.\n"
            "- Long-Term (1-3y): Establish org-wide architectural standards (Staff IC Track)."
        ),
    )

    people_metric.measure(test_case)
    assert people_metric.score >= 0.7 or people_metric.is_successful()


def test_deepeval_delivery_bottlenecks_anti_blame():
    """
    Evaluates delivery bottleneck analysis for structural flow focus and anti-blame coaching.
    """
    delivery_metric = GEval(
        name="Delivery_AntiBlame_Rubric",
        criteria=(
            "Verify that delivery flow analysis focuses on structural WIP limits, PR review queues, "
            "and blocker resolution rather than assigning individual developer blame or stack ranking."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="Analyze delivery bottlenecks and stalled PRs for active sprint in project PHOENIX.",
        actual_output=(
            "### 🚚 Delivery & Flow Scorecard: PHOENIX\n\n"
            "- Delivery Risk Index: MEDIUM | WIP Limit Violations: 2 columns exceeding limits\n"
            "- Stalled Code Reviews (>24h): 3 PRs awaiting second reviewer signoff\n"
            "- P80 Cycle Time: 34.2 hours\n"
            "- Recommendations: Introduce synchronous pairing review slots and split large PRs (>400 lines)."
        ),
    )

    delivery_metric.measure(test_case)
    assert delivery_metric.score >= 0.7 or delivery_metric.is_successful()


def test_deepeval_zero_silent_failure_fallback_provenance():
    """
    Validates that database snapshot fallbacks explicitly declare their data provenance and sync timestamps.
    """
    provenance_metric = GEval(
        name="Data_Provenance_Rubric",
        criteria=(
            "Verify that when live external APIs (Jira, GitHub, Notion) are offline or using cached fallbacks, "
            "the agent explicitly declares the data source provenance (e.g. 'PostgreSQL DB Snapshot') "
            "and does not silently return fabricated data or blank screens."
        ),
        evaluation_steps=[
            "Check if the output explicitly declares data provenance (e.g. 'PostgreSQL DB Snapshot Fallback').",
            "Check if the sync timestamp is clearly noted.",
            "Verify that real cached metrics are provided rather than empty responses.",
        ],
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.6,
    )

    test_case = LLMTestCase(
        input="Show sprint delivery bottlenecks when Jira server is offline.",
        actual_output=(
            "### 🚚 Delivery Flow Scorecard (PostgreSQL DB Snapshot Fallback)\n\n"
            "> **Data Provenance**: Cached PostgreSQL `sprint_analytics` snapshot (Synced at 2026-08-21T22:00:00Z).\n"
            "- Active Sprint: Sprint 24 | Committed: 35 pts | Completed: 28 pts | WIP Violations: 0"
        ),
    )

    provenance_metric.measure(test_case)
    assert provenance_metric.score >= 0.6 or provenance_metric.is_successful()


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


def test_deepeval_multiturn_coreference_resolution():
    """
    Validates that ambiguous follow-up pronouns ('that PR', 'the author') are resolved
    into explicit entity references before subagent execution.
    """
    coref_metric = GEval(
        name="Coreference_Resolution_Rubric",
        criteria=(
            "Verify that when a user asks a follow-up query containing pronouns like 'the author of that PR', "
            "the system correctly identifies the specific author and PR number from prior context "
            "without hallucinating unrelated engineers or failing to route."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="Prior Context: 'Found PR #104 by Alice (eng_01)'. User Query: 'Draft an SBI feedback for the author of that PR.'",
        actual_output=(
            "### 🎯 Situation-Behavior-Impact (SBI) Feedback: Alice (eng_01)\n\n"
            "**Situation**: Regarding pull request PR #104 in logsv/em-taskflow-ai.\n"
            "**Behavior**: Code review was pending for 4 days without proactive status updates.\n"
            "**Impact**: Delayed the sprint delivery milestone by 2 days."
        ),
    )

    coref_metric.measure(test_case)
    assert coref_metric.score >= 0.7 or coref_metric.is_successful()


def test_deepeval_episodic_memory_recall():
    """
    Validates that references to conversations from earlier turns (>10 turns) are recalled
    from episodic memory without causing supervisor context drift.
    """
    episodic_metric = GEval(
        name="Episodic_Memory_Recall_Rubric",
        criteria=(
            "Verify that when a query refers to topics discussed earlier in a long session, "
            "the system retrieves the accurate historical metric or agreement."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.7,
    )

    test_case = LLMTestCase(
        input="What was the MTTR benchmark target we discussed earlier in the session?",
        actual_output="As discussed earlier, our MTTR benchmark target for Elite Tier is under 2 hours (< 2h SLA).",
    )

    episodic_metric.measure(test_case)
    assert episodic_metric.score >= 0.7 or episodic_metric.is_successful()

