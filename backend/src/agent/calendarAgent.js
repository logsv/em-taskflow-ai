import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { getGoogleMCPTools } from "../mcp/index.js";
import { calendarAgentPromptTemplate } from "./prompts.js";
import { AgentOutputSchema } from "../types/agent.js";
import { getRagTool } from "./ragAgent.js";

export async function createCalendarAgent() {
  const llm = getChatModel();
  const calendarTools = getGoogleMCPTools();

  const promptValue = await calendarAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: [...calendarTools, getRagTool()],
    name: "calendar_agent",
    prompt: systemMessage,
  });
}
