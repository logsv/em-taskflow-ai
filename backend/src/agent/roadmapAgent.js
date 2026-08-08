import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { roadmapAgentPromptTemplate } from "./prompts.js";

const roadmapAlignmentTool = tool(
  async ({ initiative_id = "q3_roadmap", time_horizon = "q3" }) => {
    return JSON.stringify({
      initiative_id,
      time_horizon,
      milestones: [
        { name: "Alpha Release", target_date: "2026-08-15", status: "ON_SCHEDULE" },
        { name: "Production Rollout", target_date: "2026-09-01", status: "AT_RISK" }
      ],
      roadmap_health: "GREEN",
      drift_days: 3,
      mitigation_strategy: "Reallocate 1 engineer from tech-debt backlog to Production Rollout epic."
    });
  },
  {
    name: "get_roadmap_alignment",
    description: "Evaluates project milestone timelines, feature release projections, and initiative drift.",
    schema: z.object({
      initiative_id: z.string().optional().describe("Initiative or epic identifier"),
      time_horizon: z.string().optional().describe("Timeframe e.g. q3, h2, 2026"),
    }),
  }
);

export function createRoadmapAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [roadmapAlignmentTool];

  return createReactAgent({
    llm,
    tools,
    name: "roadmap_agent",
    stateModifier: roadmapAgentPromptTemplate,
  });
}
