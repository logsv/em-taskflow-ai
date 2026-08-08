import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { sbiAgentPromptTemplate } from "./prompts.js";

const sbiFeedbackTool = tool(
  async ({ raw_notes, context_type = "performance_review", recipient_role = "Software Engineer" }) => {
    return JSON.stringify({
      framework: "SBI (Situation-Behavior-Impact)",
      recipient_role,
      context_type,
      structured_feedback: {
        situation: `During the Q3 Release Sprint execution (${context_type}), specifically when managing critical PR reviews.`,
        behavior: raw_notes || "Delivered high quality PR reviews promptly and helped unblock peer pull requests.",
        impact: "Accelerated overall sprint velocity and improved code stability across the team.",
        growth_action_plan: "Consider mentoring junior engineers on code review best practices in upcoming sprints."
      }
    });
  },
  {
    name: "format_sbi_feedback",
    description: "Formats performance feedback using the Situation-Behavior-Impact (SBI) framework.",
    schema: z.object({
      raw_notes: z.string().describe("Raw observation notes or feedback details"),
      context_type: z.string().optional().describe("Context e.g. 1-on-1, performance review, sprint feedback"),
      recipient_role: z.string().optional().describe("Target role e.g. Staff Engineer, Senior Engineer"),
    }),
  }
);

export function createSbiAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [sbiFeedbackTool];

  return createReactAgent({
    llm,
    tools,
    name: "sbi_agent",
    stateModifier: sbiAgentPromptTemplate,
  });
}
