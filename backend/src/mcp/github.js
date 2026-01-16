import { MultiServerMCPClient } from "@langchain/mcp-adapters";

let client = null;
let tools = [];
let initialized = false;

async function ensureInit() {
  if (initialized && client) return;

  const url = process.env.GITHUB_MCP_URL;
  if (!url) {
    throw new Error("GitHub MCP URL is not configured (set GITHUB_MCP_URL)");
  }

  const headers = {};
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  client = new MultiServerMCPClient({
    mcpServers: {
      github: {
        url,
        headers,
      }
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
