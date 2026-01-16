import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatOllama } from "../llm/index.js";

export async function createGithubAgent() {
  const llm = getChatOllama();

  if (typeof llm.bindTools !== "function") {
    llm.bindTools = function (tools) {
      return this.bind({ tools });
    };
  }

  let githubTools = [];
  try {
    const githubModule = await import("../mcp/github.js");
    githubTools = await githubModule.getGithubTools();
  } catch (e) {
    console.warn("⚠️ GitHub MCP tools unavailable, continuing without GitHub tools");
    githubTools = [];
  }

  return createReactAgent({
    llm,
    tools: githubTools,
    name: "github_agent",
    prompt:
      "You are a GitHub expert. Manage repositories, pull requests, issues, and reviews. Use tools related to GitHub or source control.",
  });
}
