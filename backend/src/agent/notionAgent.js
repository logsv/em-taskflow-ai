import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { notionAgentPromptTemplate } from "./prompts.js";
import { AgentOutputSchema } from "../types/agent.js";
import { getRagTool } from "./ragAgent.js";

export async function createNotionAgent() {
  const llm = getChatModel();
  let notionTools = [];
  try {
    const notionModule = await import("../mcp/notion.js");
    notionTools = await notionModule.getNotionTools();
  } catch (e) {
    console.warn("⚠️ Notion MCP tools unavailable, continuing without Notion tools");
    notionTools = [];
  }

  const promptValue = await notionAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: [...notionTools, getRagTool()],
    name: "notion_agent",
    prompt: systemMessage,
    responseFormat: AgentOutputSchema,
  });
}
