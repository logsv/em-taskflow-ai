import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { sopAgentPromptTemplate } from "./prompts.js";

const sopComplianceTool = tool(
  async ({ topic = "general", task_context = "" }) => {
    return JSON.stringify({
      topic,
      task_context,
      compliance_status: "COMPLIANT",
      checked_sops: [
        "SOP-01: PR Code Review Guidelines (2 Approvals Required)",
        "SOP-04: Security Vulnerability Scan in CI/CD"
      ],
      findings: "Task context complies with engineering handbook requirements.",
      recommendation: "Ensure security scan step runs prior to merge."
    });
  },
  {
    name: "query_sop_compliance",
    description: "Queries engineering Standard Operating Procedures (SOPs), ADRs, and compliance guidelines.",
    schema: z.object({
      topic: z.string().optional().describe("SOP topic e.g. code review, deployment, security"),
      task_context: z.string().optional().describe("Context of task or pull request being audited"),
    }),
  }
);

export function createSopAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [sopComplianceTool];

  return createReactAgent({
    llm,
    tools,
    name: "sop_agent",
    stateModifier: sopAgentPromptTemplate,
  });
}
