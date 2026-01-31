import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatModel } from "../llm/index.js";
import { githubAgentPromptTemplate } from "./prompts.js";

export async function createGithubAgent() {
  const llm = getChatModel();
  let githubTools = [];
  try {
    const githubModule = await import("../mcp/github.js");
    githubTools = await githubModule.getGithubTools();
  } catch (e) {
    console.warn("⚠️ GitHub MCP tools unavailable, continuing without GitHub tools");
    githubTools = [];
  }

  const promptValue = await githubAgentPromptTemplate.invoke({});
  const systemMessage = promptValue.toChatMessages()[0];

  return createReactAgent({
    llm,
    tools: githubTools,
    name: "github_agent",
    prompt: systemMessage,
  });
}
