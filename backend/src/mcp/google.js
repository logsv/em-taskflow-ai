import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";

let client = null;
let tools = [];
let initialized = false;

async function ensureInit() {
  if (initialized && client) return;

  const { google } = getMcpConfig();
  const url = process.env.GOOGLE_MCP_URL || process.env.CALENDAR_MCP_URL || null;
  if (!google.enabled || !url) {
    throw new Error("Google Calendar MCP URL is not configured (set GOOGLE_MCP_URL or CALENDAR_MCP_URL)");
  }

  const headers = {};
  if (process.env.GOOGLE_MCP_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GOOGLE_MCP_TOKEN}`;
  }

  client = new MultiServerMCPClient({
    mcpServers: {
      google: {
        url,
        headers,
      },
    },
  });

  tools = await client.getTools();
  initialized = true;
}

export async function getGoogleTools() {
  await ensureInit();
  return tools;
}

export async function closeGoogleMcp() {
  if (client) {
    try {
      await client.close();
    } catch {}
  }
  client = null;
  tools = [];
  initialized = false;
}
