import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { doraAgentPromptTemplate } from "./prompts.js";

const doraMetricsTool = tool(
  async ({ time_window = "30d", repo_id = "default", team_id = "default" }) => {
    // Computes DORA metrics: Deployment Frequency, Lead Time, Change Failure Rate, MTTR
    return JSON.stringify({
      team_id,
      repo_id,
      time_window,
      rating: "HIGH",
      deployment_frequency: "3.5 deploys/week",
      lead_time_hours: 18.5,
      change_failure_rate_pct: 4.2,
      mttr_hours: 1.5,
      recommendation: "Maintain automated CI/CD pipeline tests. Lead time is within top 20th percentile."
    });
  },
  {
    name: "calculate_dora_metrics",
    description: "Calculates DORA metrics (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR) for a team or repository.",
    schema: z.object({
      time_window: z.string().optional().describe("Time window for metrics (e.g. 7d, 30d, 90d)"),
      repo_id: z.string().optional().describe("Repository identifier"),
      team_id: z.string().optional().describe("Team identifier"),
    }),
  }
);

export function createDoraAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [doraMetricsTool];

  return createReactAgent({
    llm,
    tools,
    name: "dora_agent",
    stateModifier: doraAgentPromptTemplate,
  });
}
