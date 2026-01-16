import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";

let client = null;
let tools = [];
let initialized = false;

async function ensureInit() {
  if (initialized && client) return;
  const { notion } = getMcpConfig();

  const url =
    process.env.NOTION_MCP_URL;

  if (!url) {
    throw new Error("Notion MCP URL is not configured (set NOTION_MCP_URL)");
  }

  const headers = {};
  if (notion.apiKey) {
    headers.Authorization = `Bearer ${notion.apiKey}`;
  } else if (process.env.NOTION_API_KEY) {
    headers.Authorization = `Bearer ${process.env.NOTION_API_KEY}`;
  }

  client = new MultiServerMCPClient({
    mcpServers: {
      notion: {
        url,
        headers,
      }
    }
  });

  tools = await client.getTools();
  initialized = true;
}

export async function getNotionTools() {
  await ensureInit();
  return tools;
}

export async function closeNotionMcp() {
  if (client) {
    try {
      await client.close();
    } catch {}
  }
  client = null;
  tools = [];
  initialized = false;
}
