import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatOllama } from "../llm/index.js";
import { getNotionMCPTools, getMCPTools } from "../mcp/index.js";

export async function createNotionAgent() {
  const llm = getChatOllama();

  if (typeof llm.bindTools !== "function") {
    llm.bindTools = function (tools) {
      return this.bind({ tools });
    };
  }

  const allTools = getMCPTools();
  const notionTools = getNotionMCPTools();

  return createReactAgent({
    llm,
    tools: notionTools.length > 0 ? notionTools : allTools,
    name: "notion_agent",
    prompt:
      "You are a Notion workspace expert. Manage pages, databases, tasks, and project documentation using Notion tools.",
  });
}

