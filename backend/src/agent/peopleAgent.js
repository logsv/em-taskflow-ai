import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { peopleAgentPromptTemplate } from "./prompts.js";

const peopleGrowthTool = tool(
  async ({ engineer_id = "default_engineer", review_period = "current_quarter" }) => {
    return JSON.stringify({
      engineer_id,
      review_period,
      burnout_risk_score: "LOW",
      weekly_workload_hours: 41.5,
      skill_matrix_gaps: ["System Architecture Design"],
      promotion_readiness: "ON_TRACK (80% criteria met)",
      one_on_one_agenda: [
        "Review progress on architecture design document",
        "Discuss team workload and upcoming sprint PTO",
        "Review career progression goals for next level"
      ]
    });
  },
  {
    name: "analyze_personnel_growth",
    description: "Analyzes engineer career growth, skill matrices, 1-on-1 agendas, and burnout risk indicators.",
    schema: z.object({
      engineer_id: z.string().optional().describe("Engineer identifier or name"),
      review_period: z.string().optional().describe("Review period e.g. current_quarter, YTD"),
    }),
  }
);

export function createPeopleAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [peopleGrowthTool];

  return createReactAgent({
    llm,
    tools,
    name: "people_agent",
    stateModifier: peopleAgentPromptTemplate,
  });
}
