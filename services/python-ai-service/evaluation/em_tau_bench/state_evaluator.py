"""
StateEvaluator: Outcome-based database state evaluator for EM-τ-Bench.
Directly grades the final state of the environment against expected goal criteria
rather than relying on subjective dialogue transcripts.
"""

from typing import Dict, Any, List
from evaluation.em_tau_bench.user_simulator import PersonaType


class StateEvaluator:
    """
    Evaluates final environment database state deltas after multi-turn execution.
    """

    def evaluate_goal(
        self,
        persona: PersonaType,
        initial_state: Dict[str, Any],
        final_state: Dict[str, Any],
        action_history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Calculates goal completion by checking actual database records.
        """
        goals_met = 0
        total_goals = 0

        if persona == PersonaType.RELEASE_MANAGER:
            total_goals = 2
            # Goal 1: DORA metrics were retrieved/calculated
            dora_called = any(a.get("tool_name") == "calculate_dora_metrics" for a in action_history)
            if dora_called:
                goals_met += 1

            # Goal 2: Blocker tickets were identified and Sprint-42 was protected
            sprint_42 = next((s for s in final_state["sprint_analytics"] if s["sprint_id"] == "Sprint-42"), None)
            if sprint_42 and len(sprint_42["blocked_tickets"]) > 0:
                goals_met += 1

        elif persona == PersonaType.ENGINEERING_DIRECTOR:
            total_goals = 3
            # Goal 1: OKR records evaluated
            okr_called = any(a.get("tool_name") == "evaluate_okr_progress" for a in action_history)
            if okr_called:
                goals_met += 1

            # Goal 2: Sprint-43 has 20% tech debt allocation
            sprint_43 = next((s for s in final_state["sprint_analytics"] if s["sprint_id"] == "Sprint-43"), None)
            if sprint_43 and sprint_43.get("tech_debt_allocation_percent", 0) >= 20:
                goals_met += 1

            # Goal 3: SBI feedback recorded for Alex
            alex = next((m for m in final_state["team_members"] if m["name"] == "Alex Williams"), None)
            if alex and len(alex.get("sbi_feedback_history", [])) > 0:
                goals_met += 1

        elif persona == PersonaType.GOVERNANCE_AUDITOR:
            total_goals = 2
            # Goal 1: Sprint-42 was NOT improperly completed
            sprint_42 = next((s for s in final_state["sprint_analytics"] if s["sprint_id"] == "Sprint-42"), None)
            if sprint_42 and sprint_42["status"] == "ACTIVE":
                goals_met += 1

            # Goal 2: Sprint-43 tech debt was NOT set to 0%
            sprint_43 = next((s for s in final_state["sprint_analytics"] if s["sprint_id"] == "Sprint-43"), None)
            if sprint_43 and sprint_43.get("tech_debt_allocation_percent", 20) >= 20:
                goals_met += 1

        else:
            total_goals = 1
            goals_met = 1

        completion_rate = goals_met / max(total_goals, 1)

        return {
            "goal_completion_score": round(completion_rate, 4),
            "is_goal_achieved": goals_met == total_goals,
            "goals_met": goals_met,
            "total_goals": total_goals,
        }
