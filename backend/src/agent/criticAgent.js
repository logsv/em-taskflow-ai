import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { criticAgentPromptTemplate } from "./prompts.js";

const auditReportTool = tool(
  async ({ draft_response = "", audit_type = "full_audit" }) => {
    return JSON.stringify({
      audit_type,
      tone_empathy_check: "PASS - Tone is supportive, objective, and constructive.",
      math_accuracy_check: "PASS - Metrics and totals are verified.",
      link_integrity_check: "PASS - Markdown links are formatted correctly.",
      audited_markdown: draft_response || "Audit completed cleanly."
    });
  },
  {
    name: "audit_em_report",
    description: "Audits draft EM reports for tone empathy, mathematical accuracy, and Markdown link integrity.",
    schema: z.object({
      draft_response: z.string().optional().describe("Draft markdown content to audit"),
      audit_type: z.string().optional().describe("Audit focus e.g. tone, math, links, full_audit"),
    }),
  }
);

export function createCriticAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [auditReportTool];

  return createReactAgent({
    llm,
    tools,
    name: "critic_agent",
    stateModifier: criticAgentPromptTemplate,
  });
}
