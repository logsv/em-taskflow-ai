import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";

let client = null;
let tools = [];
let initialized = false;

async function ensureInit() {
  if (initialized && client) return;
  const { jira } = getMcpConfig();

  const url =
    process.env.JIRA_MCP_URL ||
    jira.url ||
    "https://mcp.atlassian.com/v1/mcp";

  if (!url) {
    throw new Error("Jira MCP URL is not configured (set JIRA_MCP_URL or config.mcp.jira.url)");
  }

  const headers = {};
  if (process.env.JIRA_MCP_TOKEN) {
    headers.Authorization = `Bearer ${process.env.JIRA_MCP_TOKEN}`;
  } else if (jira.apiToken) {
    headers.Authorization = `Bearer ${jira.apiToken}`;
  }

  client = new MultiServerMCPClient({
    mcpServers: {
      atlassian: {
        url,
        headers,
      }
    }
  });

  tools = await client.getTools();
  initialized = true;
}

export async function getJiraTools() {
  await ensureInit();
  return tools;
}

export async function closeJiraMcp() {
  if (client) {
    try {
      await client.close();
    } catch {}
  }
  client = null;
  tools = [];
  initialized = false;
}
