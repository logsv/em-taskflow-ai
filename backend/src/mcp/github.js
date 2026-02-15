import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";
import { GithubOAuthProvider } from "./githubOAuthProvider.js";

let client = null;
let tools = [];
let initialized = false;

async function ensureInit() {
  if (initialized && client) return;

  const { github } = getMcpConfig();
  const url = process.env.GITHUB_MCP_URL || github.url;
  if (!url) {
    throw new Error("GitHub MCP URL is not configured (set GITHUB_MCP_URL)");
  }

  const serverConfig = { url };
  if (github.oauth?.enabled) {
    const provider = new GithubOAuthProvider();
    const tokens = await provider.tokens();
    if (!tokens?.access_token) {
      const pending = await provider.getPendingAuthorization();
      const hint = pending?.url
        ? `GitHub OAuth required. Complete authorization via ${pending.url}`
        : "GitHub OAuth required. Start via /api/mcp/github/oauth/start";
      throw new Error(hint);
    }
    serverConfig.authProvider = provider;
  } else {
    const headers = {};
    if (github.token) {
      headers.Authorization = `Bearer ${github.token}`;
    } else if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    if (Object.keys(headers).length > 0) {
      serverConfig.headers = headers;
    }
  }

  client = new MultiServerMCPClient({
    mcpServers: {
      github: serverConfig
    }
  });

  tools = await client.getTools();
  initialized = true;
}

export async function getGithubTools() {
  await ensureInit();
  return tools;
}

export async function closeGithubMcp() {
  if (client) {
    try {
      await client.close();
    } catch {}
  }
  client = null;
  tools = [];
  initialized = false;
}
