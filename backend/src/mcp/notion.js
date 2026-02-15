import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";
import { NotionOAuthProvider } from "./notionOAuthProvider.js";

let client = null;
let tools = [];
let initialized = false;

async function ensureInit() {
  if (initialized && client) return;
  const { notion } = getMcpConfig();

  const url = process.env.NOTION_MCP_URL || notion.url;

  if (!url) {
    throw new Error("Notion MCP URL is not configured (set NOTION_MCP_URL)");
  }

  const serverConfig = { url };
  if (notion.oauth?.enabled) {
    const provider = new NotionOAuthProvider();
    const tokens = await provider.tokens();
    if (!tokens?.access_token) {
      const pending = await provider.getPendingAuthorization();
      const hint = pending?.url
        ? `Notion OAuth required. Complete authorization via ${pending.url}`
        : "Notion OAuth required. Start via /api/mcp/notion/oauth/start";
      throw new Error(hint);
    }
    serverConfig.authProvider = provider;
  } else {
    const headers = {};
    if (notion.apiKey) {
      headers.Authorization = `Bearer ${notion.apiKey}`;
    } else if (process.env.NOTION_API_KEY) {
      headers.Authorization = `Bearer ${process.env.NOTION_API_KEY}`;
    }
    if (Object.keys(headers).length > 0) {
      serverConfig.headers = headers;
    }
  }

  client = new MultiServerMCPClient({
    mcpServers: {
      notion: serverConfig,
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
