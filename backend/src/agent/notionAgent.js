import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { notionAgentPromptTemplate } from "./prompts.js";
import { getRagTool } from "./ragAgent.js";
import { getNotionMCPTools } from "../mcp/index.js";

export async function createNotionAgent() {
  const llm = getChatModel();
  const notionTools = getNotionMCPTools();

  const promptValue = await notionAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: [...notionTools, getRagTool()],
    name: "notion_agent",
    prompt: systemMessage,
  });
}
