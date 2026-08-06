import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../llm/index.js";
import { retroAgentPromptTemplate } from "./prompts.js";

const sprintRetroTool = tool(
  async ({ sprint_id = "last_sprint", retro_notes = "" }) => {
    return JSON.stringify({
      sprint_id,
      what_went_well: [
        "High test coverage maintained (93 specs passing)",
        "Zero downtime recorded during DB schema updates"
      ],
      what_needs_improvement: [
        "PR review wait times averaged 14 hours",
        "Context switching on hotfixes during midpoint"
      ],
      extracted_action_items: [
        { task: "Establish dedicated daily PR review window at 10 AM", owner: "@team-lead", target: "Next Sprint" },
        { task: "Automate CI check for PR labels", owner: "@devops", target: "End of Week" }
      ]
    });
  },
  {
    name: "generate_sprint_retro",
    description: "Synthesizes sprint delivery performance into structured retrospective notes and action items.",
    schema: z.object({
      sprint_id: z.string().optional().describe("Sprint identifier"),
      retro_notes: z.string().optional().describe("Raw retro feedback notes from team"),
    }),
  }
);

export function createRetroAgent(customTools = null, options = {}) {
  const llm = options.llm || getChatModel();
  const tools = customTools && customTools.length > 0 ? customTools : [sprintRetroTool];

  return createReactAgent({
    llm,
    tools,
    name: "retro_agent",
    stateModifier: retroAgentPromptTemplate,
  });
}
