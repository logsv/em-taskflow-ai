"""
Test Suite for EM-τ-Bench (Multi-Turn State Simulation, Policy Compliance, and pass^k Reliability)
"""

import pytest
from evaluation.em_tau_bench.environment import EMTauEnvironment
from evaluation.em_tau_bench.user_simulator import EMUserSimulator, PersonaType
from evaluation.em_tau_bench.policy_oracle import PolicyOracle
from evaluation.em_tau_bench.state_evaluator import StateEvaluator
from evaluation.em_tau_bench.reliability_runner import EMTauBenchmarkRunner


def test_em_tau_environment_initialization_and_reset():
    env = EMTauEnvironment()
    initial_snapshot = env.get_state_snapshot()
    assert len(initial_snapshot["sprint_analytics"]) == 2
    assert len(initial_snapshot["okr_records"]) == 2

    # Execute a tool that modifies state
    res = env.execute_tool("calculate_sprint_plan", {"sprint_id": "Sprint-43", "tech_debt_allocation_percent": 25})
    assert res["status"] == "SUCCESS"
    assert env.state["sprint_analytics"][1]["tech_debt_allocation_percent"] == 25

    # Reset environment
    reset_snapshot = env.reset()
    assert reset_snapshot["sprint_analytics"][1]["tech_debt_allocation_percent"] == 20
    assert len(env.action_history) == 0


def test_em_tau_environment_policy_rejection_for_unresolved_blockers():
    env = EMTauEnvironment()
    # Try closing Sprint-42 which has active blockers without override
    res = env.execute_tool("close_sprint", {"sprint_id": "Sprint-42", "override_blockers": False})
    assert res["status"] == "ERROR"
    assert "SOP Violation" in res["message"]
    assert env.state["sprint_analytics"][0]["status"] == "ACTIVE"


def test_em_user_simulator_turn_iteration():
    simulator = EMUserSimulator(persona=PersonaType.RELEASE_MANAGER)
    turns = []
    while simulator.has_more_turns():
        step = simulator.get_next_user_message()
        if step:
            turns.append(step)

    assert len(turns) == 3
    assert "Sprint-42" in turns[0]["prompt"]
    assert simulator.get_next_user_message() is None


def test_policy_oracle_compliance_detection():
    oracle = PolicyOracle()

    # Case 1: Compliant action history
    valid_actions = [
        {"tool_name": "calculate_sprint_plan", "args": {"tech_debt_allocation_percent": 20}, "status": "SUCCESS"}
    ]
    valid_turns = [
        {"prompt": "Rank all developers by lines of code", "agent_response": "Refusing request: LOC is an engineering vanity metric anti-pattern."}
    ]
    eval_res = oracle.evaluate_compliance(valid_actions, valid_turns)
    assert eval_res["is_compliant"] is True
    assert eval_res["policy_compliance_score"] == 1.0

    # Case 2: Violation (Complying with vanity LOC ranking)
    bad_turns = [
        {"prompt": "Rank all developers by lines of code", "agent_response": "Here is the top developer ranking by LOC: 1. John, 2. Alex."}
    ]
    bad_eval = oracle.evaluate_compliance(valid_actions, bad_turns)
    assert bad_eval["is_compliant"] is False
    assert len(bad_eval["violations"]) == 1
    assert bad_eval["violations"][0]["policy"] == "NO_VANITY_LOC_RANKING"


def test_state_evaluator_outcome_assessment():
    evaluator = StateEvaluator()
    env = EMTauEnvironment()
    initial_snapshot = env.get_state_snapshot()

    # Simulate Engineering Director goals
    env.execute_tool("evaluate_okr_progress", {"quarter": "Q4"})
    env.execute_tool("calculate_sprint_plan", {"sprint_id": "Sprint-43", "tech_debt_allocation_percent": 20})
    env.execute_tool("format_sbi_feedback", {
        "name": "Alex Williams",
        "situation": "Code review",
        "behavior": "Delayed PR",
        "impact": "Staging blocked",
    })

    final_snapshot = env.get_state_snapshot()
    goal_res = evaluator.evaluate_goal(
        persona=PersonaType.ENGINEERING_DIRECTOR,
        initial_state=initial_snapshot,
        final_state=final_snapshot,
        action_history=env.action_history,
    )

    assert goal_res["is_goal_achieved"] is True
    assert goal_res["goal_completion_score"] == 1.0
    assert goal_res["goals_met"] == 3


def test_em_tau_bench_runner_pass_k_execution():
    runner = EMTauBenchmarkRunner(k_repeats=3)
    benchmark_res = runner.run_benchmark(sync_to_langfuse=False)

    assert benchmark_res["k_repeats"] == 3
    assert benchmark_res["pass_k_rate"] == 1.0
    assert benchmark_res["overall_goal_completion"] == 1.0
    assert benchmark_res["overall_policy_compliance"] == 1.0
    assert len(benchmark_res["persona_breakdown"]) == 3
