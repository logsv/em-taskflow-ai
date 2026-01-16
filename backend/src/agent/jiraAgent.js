import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";

export async function createJiraAgent() {
  const llm = getChatModel();
  let jiraTools = [];
  try {
    const jiraModule = await import("../mcp/jira.js");
    jiraTools = await jiraModule.getJiraTools();
  } catch (e) {
    console.warn("⚠️ Jira MCP tools unavailable, continuing without Jira tools");
    jiraTools = [];
  }

  return createReactAgent({
    llm,
    tools: jiraTools,
    name: "jira_agent",
    prompt:
      "You are a Jira expert. Manage issues, sprints, roadmaps, and work items. Use only tools relevant to Jira and related Atlassian resources.",
  });
}
