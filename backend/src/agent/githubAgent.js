import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getChatOllama } from "../llm/index.js";
import { getGithubMCPTools, getMCPTools } from "../mcp/index.js";

export async function createGithubAgent() {
  const llm = getChatOllama();

  if (typeof llm.bindTools !== "function") {
    llm.bindTools = function (tools) {
      return this.bind({ tools });
    };
  }

  const allTools = getMCPTools();
  const githubTools = getGithubMCPTools();

  return createReactAgent({
    llm,
    tools: githubTools.length > 0 ? githubTools : allTools,
    name: "github_agent",
    prompt:
      "You are a GitHub expert. Manage repositories, pull requests, issues, and reviews. Use tools related to GitHub or source control.",
  });
}

