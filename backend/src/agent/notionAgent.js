import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatOllama } from "../llm/index.js";

export async function createNotionAgent() {
  const llm = getChatOllama();

  if (typeof llm.bindTools !== "function") {
    llm.bindTools = function (tools) {
      return this.bind({ tools });
    };
  }

  let notionTools = [];
  try {
    const notionModule = await import("../mcp/notion.js");
    notionTools = await notionModule.getNotionTools();
  } catch (e) {
    console.warn("⚠️ Notion MCP tools unavailable, continuing without Notion tools");
    notionTools = [];
  }

  return createReactAgent({
    llm,
    tools: notionTools,
    name: "notion_agent",
    prompt:
      "You are a Notion workspace expert. Manage pages, databases, tasks, and project documentation using Notion tools.",
  });
}
