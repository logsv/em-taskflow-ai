import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { jiraAgentPromptTemplate } from "./prompts.js";
import { getRagTool } from "./ragAgent.js";
import { getJiraMCPTools } from "../mcp/index.js";

export async function createJiraAgent() {
  const llm = getChatModel();
  const jiraTools = getJiraMCPTools();

  const promptValue = await jiraAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: [...jiraTools, getRagTool()],
    name: "jira_agent",
    prompt: systemMessage,
  });
}
