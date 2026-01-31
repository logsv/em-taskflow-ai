import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { jiraAgentPromptTemplate } from "./prompts.js";

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

  const promptValue = await jiraAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: jiraTools,
    name: "jira_agent",
    prompt: systemMessage,
  });
}
