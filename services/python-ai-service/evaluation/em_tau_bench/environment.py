"""
EMTauEnvironment: In-Memory Simulated State & Tool Execution Sandbox for EM-τ-Bench.
Tracks PostgreSQL database tables (sprints, OKRs, DORA snapshots, team profiles)
and simulates MCP tool mutations for outcome-based state grading.
"""

import copy
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("em_tau_bench.environment")


class EMTauEnvironment:
    """
    Simulated stateful environment for Engineering Management agent evaluation.
    """

    def __init__(self, initial_state: Optional[Dict[str, Any]] = None):
        self._default_state = {
            "sprint_analytics": [
                {
                    "sprint_id": "Sprint-42",
                    "status": "ACTIVE",
                    "velocity": 38,
                    "story_points_total": 45,
                    "story_points_completed": 35,
                    "blocked_tickets": ["PAY-104", "PAY-109"],
                    "tech_debt_allocation_percent": 20,
                },
                {
                    "sprint_id": "Sprint-43",
                    "status": "PLANNING",
                    "velocity": 40,
                    "story_points_total": 0,
                    "story_points_completed": 0,
                    "blocked_tickets": [],
                    "tech_debt_allocation_percent": 20,
                },
            ],
            "okr_records": [
                {
                    "quarter": "Q4",
                    "key_result_id": "KR-LATENCY-01",
                    "objective": "Improve API latency under 150ms",
                    "target_value": 150.0,
                    "current_value": 138.0,
                    "status": "ON_TRACK",
                    "pacing_score": 1.0,
                },
                {
                    "quarter": "Q4",
                    "key_result_id": "KR-COVERAGE-02",
                    "objective": "Achieve 85% unit test coverage across backend",
                    "target_value": 85.0,
                    "current_value": 78.0,
                    "status": "AT_RISK",
                    "pacing_score": 0.75,
                },
            ],
            "dora_snapshots": [
                {
                    "repo": "logsv/em-taskflow-ai",
                    "deployment_frequency": "3.5 deploys/week",
                    "lead_time_hours": 18.5,
                    "change_failure_rate_percent": 4.2,
                    "mttr_hours": 1.8,
                    "tier": "ELITE",
                }
            ],
            "team_members": [
                {
                    "engineer_id": "eng_01",
                    "name": "Alex Williams",
                    "role": "Senior Software Engineer",
                    "sbi_feedback_history": [],
                    "career_level": "L5",
                },
                {
                    "engineer_id": "eng_02",
                    "name": "Sarah Chen",
                    "role": "Staff Software Engineer",
                    "sbi_feedback_history": [],
                    "career_level": "L6",
                },
            ],
            "audit_logs": [],
        }

        self.initial_state = initial_state or copy.deepcopy(self._default_state)
        self.state = copy.deepcopy(self.initial_state)
        self.action_history: List[Dict[str, Any]] = []

    def reset(self) -> Dict[str, Any]:
        """Resets the environment back to initial state."""
        self.state = copy.deepcopy(self.initial_state)
        self.action_history = []
        return self.get_state_snapshot()

    def get_state_snapshot(self) -> Dict[str, Any]:
        """Returns an immutable deep-copy snapshot of current state."""
        return copy.deepcopy(self.state)

    def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a simulated MCP tool against the environment state.
        Records the action for policy auditing and returns execution result.
        """
        action_record = {"tool_name": tool_name, "args": copy.deepcopy(args), "status": "SUCCESS"}

        try:
            if tool_name == "calculate_sprint_plan":
                sprint_id = args.get("sprint_id", "Sprint-42")
                tech_debt = args.get("tech_debt_allocation_percent", 20)
                for s in self.state["sprint_analytics"]:
                    if s["sprint_id"] == sprint_id:
                        s["tech_debt_allocation_percent"] = tech_debt
                        s["status"] = args.get("new_status", s["status"])
                result = {"status": "SUCCESS", "sprint_id": sprint_id, "tech_debt_allocation": tech_debt}

            elif tool_name == "close_sprint":
                sprint_id = args.get("sprint_id", "Sprint-42")
                override_blockers = args.get("override_blockers", False)
                for s in self.state["sprint_analytics"]:
                    if s["sprint_id"] == sprint_id:
                        if s["blocked_tickets"] and not override_blockers:
                            action_record["status"] = "POLICY_REJECTED"
                            result = {
                                "status": "ERROR",
                                "message": f"SOP Violation: Cannot close {sprint_id} with unresolved blockers: {s['blocked_tickets']}",
                            }
                            self.action_history.append(action_record)
                            return result
                        s["status"] = "COMPLETED"
                result = {"status": "SUCCESS", "sprint_id": sprint_id, "state": "COMPLETED"}

            elif tool_name == "evaluate_okr_progress":
                quarter = args.get("quarter", "Q4")
                records = [r for r in self.state["okr_records"] if r["quarter"] == quarter]
                result = {"status": "SUCCESS", "quarter": quarter, "okrs": records}

            elif tool_name == "format_sbi_feedback":
                engineer_id = args.get("engineer_id", "eng_01")
                feedback_entry = {
                    "situation": args.get("situation", ""),
                    "behavior": args.get("behavior", ""),
                    "impact": args.get("impact", ""),
                }
                for m in self.state["team_members"]:
                    if m["engineer_id"] == engineer_id or m["name"].lower() == args.get("name", "").lower():
                        m["sbi_feedback_history"].append(feedback_entry)
                result = {"status": "SUCCESS", "recorded_feedback": feedback_entry}

            elif tool_name == "calculate_dora_metrics":
                repo = args.get("repo", "logsv/em-taskflow-ai")
                match = next((d for d in self.state["dora_snapshots"] if d["repo"] == repo), self.state["dora_snapshots"][0])
                result = {"status": "SUCCESS", "dora_metrics": match}

            elif tool_name == "query_sop_compliance":
                topic = args.get("topic", "incident_escalation")
                result = {
                    "status": "SUCCESS",
                    "policy": "SOP-01: P0 incidents require 5-minute acknowledgement and 15-minute Slack broadcast.",
                }

            elif tool_name == "audit_em_report":
                result = {
                    "status": "SUCCESS",
                    "verdict": "APPROVED",
                    "checks": {"tone_neutrality": True, "math_consistency": True},
                }

            else:
                result = {"status": "SUCCESS", "tool": tool_name, "args": args}

            action_record["result"] = result
            self.action_history.append(action_record)
            return result

        except Exception as e:
            action_record["status"] = "ERROR"
            action_record["error"] = str(e)
            self.action_history.append(action_record)
            return {"status": "ERROR", "message": str(e)}
