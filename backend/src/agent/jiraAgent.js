import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatOllama } from "../llm/index.js";
import { getJiraMCPTools, getMCPTools } from "../mcp/index.js";

export async function createJiraAgent() {
  const llm = getChatOllama();

  if (typeof llm.bindTools !== "function") {
    llm.bindTools = function (tools) {
      return this.bind({ tools });
    };
  }

  const allTools = getMCPTools();
  const jiraTools = getJiraMCPTools();

  return createReactAgent({
    llm,
    tools: jiraTools.length > 0 ? jiraTools : allTools,
    name: "jira_agent",
    prompt:
      "You are a Jira expert. Manage issues, sprints, roadmaps, and work items. Use only tools relevant to Jira and related Atlassian resources.",
  });
}

