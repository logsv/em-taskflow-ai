import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";

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

  return createReactAgent({
    llm,
    tools: notionTools,
    name: "notion_agent",
    prompt:
      "You are a Notion workspace expert. Manage pages, databases, tasks, and project documentation using Notion tools.",
  });
}
