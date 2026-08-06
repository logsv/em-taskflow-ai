import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { deliveryAgentPromptTemplate } from "./prompts.js";

const deliveryBottlenecksTool = tool(
  async ({ sprint_id = "active_sprint", board_id = "main_board" }) => {
    return JSON.stringify({
      sprint_id,
      board_id,
      wip_violations: 2,
      blocked_tickets: [
        { key: "ENG-104", summary: "Database migration schema lock", blocked_by: "ENG-99" }
      ],
      avg_pr_review_wait_hours: 14.2,
      cycle_time_p80_hours: 48.0,
      scope_creep_points: 5,
      delivery_risk_index: "MEDIUM"
    });
  },
  {
    name: "analyze_delivery_bottlenecks",
    description: "Analyzes team throughput, Work-In-Progress (WIP) limits, blocked tickets, and PR review latency.",
    schema: z.object({
      sprint_id: z.string().optional().describe("Sprint identifier"),
      board_id: z.string().optional().describe("Board identifier"),
    }),
  }
);

export function createDeliveryAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [deliveryBottlenecksTool];

  return createReactAgent({
    llm,
    tools,
    name: "delivery_agent",
    stateModifier: deliveryAgentPromptTemplate,
  });
}
