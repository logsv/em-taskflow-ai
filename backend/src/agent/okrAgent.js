import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { okrAgentPromptTemplate } from "./prompts.js";

const okrProgressTool = tool(
  async ({ quarter = "Q3", objective_id = "all" }) => {
    return JSON.stringify({
      quarter,
      objective_id,
      overall_completion_pct: 72,
      key_results: [
        { kr: "Maintain >95% DORA lead time rating", target: 95, current: 98, status: "ON_TRACK" },
        { kr: "Reduce PR review latency to <12 hours", target: 12, current: 14.2, status: "AT_RISK" },
        { kr: "Zero high-severity security vulnerabilities", target: 0, current: 0, status: "ON_TRACK" }
      ],
      pacing: "ON_TRACK"
    });
  },
  {
    name: "evaluate_okr_progress",
    description: "Evaluates quarterly engineering Objectives & Key Results (OKRs) and KPI scorecards.",
    schema: z.object({
      quarter: z.string().optional().describe("Quarter identifier e.g. Q1, Q2, Q3, Q4"),
      objective_id: z.string().optional().describe("Objective identifier"),
    }),
  }
);

export function createOkrAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [okrProgressTool];

  return createReactAgent({
    llm,
    tools,
    name: "okr_agent",
    stateModifier: okrAgentPromptTemplate,
  });
}
