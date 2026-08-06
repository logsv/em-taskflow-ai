import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { sprintAgentPromptTemplate } from "./prompts.js";

const sprintPlanTool = tool(
  async ({ backlog_ids = [], team_capacity = 40, target_velocity = 35 }) => {
    return JSON.stringify({
      target_velocity,
      team_capacity_hours: team_capacity,
      recommended_commitment_points: 32,
      planned_stories_count: backlog_ids.length > 0 ? backlog_ids.length : 8,
      risk_factors: [
        "2 engineers taking PTO on Day 7-8",
        "High complexity in backend service migration ticket"
      ],
      suggested_scope: "Commit to 32 story points to maintain buffer for unexpected production issues."
    });
  },
  {
    name: "calculate_sprint_plan",
    description: "Calculates sprint capacity, story point velocity, and commitments for upcoming sprint planning.",
    schema: z.object({
      backlog_ids: z.array(z.string()).optional().describe("List of candidate ticket IDs"),
      team_capacity: z.number().optional().describe("Total team capacity in engineering days or hours"),
      target_velocity: z.number().optional().describe("Historical average story point velocity"),
    }),
  }
);

export function createSprintAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [sprintPlanTool];

  return createReactAgent({
    llm,
    tools,
    name: "sprint_agent",
    stateModifier: sprintAgentPromptTemplate,
  });
}
