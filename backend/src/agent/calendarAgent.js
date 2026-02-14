import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { getGoogleMCPTools } from "../mcp/index.js";
import { calendarAgentPromptTemplate } from "./prompts.js";

export async function createCalendarAgent() {
  const llm = getChatModel();
  let calendarTools = [];
  try {
    calendarTools = getGoogleMCPTools();
  } catch (e) {
    console.warn("⚠️ Calendar MCP tools unavailable, continuing without Calendar tools");
    calendarTools = [];
  }

  const promptValue = await calendarAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: calendarTools,
    name: "calendar_agent",
    prompt: systemMessage,
  });
}
