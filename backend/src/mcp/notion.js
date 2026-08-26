import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";
import { NotionOAuthProvider } from "./notionOAuthProvider.js";
import settingsService from "../services/settingsService.js";

let client = null;
let tools = [];
let initialized = false;

function createNativeNotionTools(token) {
  const headers = {
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const notionSearchTool = new DynamicStructuredTool({
    name: "notion_search",
    description: "Search Notion workspace for sprint goals, team working agreements, engineering SOPs, and meeting notes.",
    schema: z.object({
      query: z.string().default("sprint goals working agreements").describe("Search query string"),
    }),
    func: async ({ query = "sprint goals working agreements" }) => {
      const activeToken = token || settingsService.getCachedSettings()?.mcp?.notion?.apiKey || process.env.NOTION_API_KEY || null;
      try {
        console.log(`📓 Notion REST API notion_search: query="${query}"`);
        if (activeToken) {
          const res = await axios.post(
            "https://api.notion.com/v1/search",
            { query, page_size: 10 },
            { headers: { ...headers, Authorization: `Bearer ${activeToken}` }, timeout: 8000 }
          );
          const results = res.data?.results || [];
          if (results.length > 0) {
            const formatted = results.map((item) => {
              const titleProp = item.properties?.title || item.properties?.Name || item.properties?.Title;
              const title = titleProp?.title?.[0]?.plain_text || item.title?.[0]?.plain_text || "Untitled Page";
              return {
                id: item.id,
                object: item.object,
                title,
                url: item.url,
                last_edited_time: item.last_edited_time,
              };
            });
            return JSON.stringify({ results: formatted, source: "notion_live_api" }, null, 2);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Notion REST API search failed (${err?.message}), using cached working agreements fallback...`);
      }

      return JSON.stringify({
        status: "UNAVAILABLE",
        service: "notion",
        reason: "NOTION_NOT_CONFIGURED_OR_UNREACHABLE",
        message: "Notion API key is not configured or the workspace is unreachable. Configure NOTION_API_KEY in Admin Settings.",
        results: [],
      }, null, 2);
    },
  });

  const notionGetPageTool = new DynamicStructuredTool({
    name: "notion_get_page",
    description: "Retrieve complete content, blocks, and headings from a specific Notion document.",
    schema: z.object({
      page_id: z.string().describe("Notion page ID or URL"),
    }),
    func: async ({ page_id }) => {
      const activeToken = token || settingsService.getCachedSettings()?.mcp?.notion?.apiKey || process.env.NOTION_API_KEY || null;
      try {
        console.log(`📓 Notion REST API notion_get_page: ${page_id}`);
        if (activeToken) {
          const cleanId = page_id.replace(/-/g, "");
          const res = await axios.get(`https://api.notion.com/v1/blocks/${cleanId}/children`, {
            headers: { ...headers, Authorization: `Bearer ${activeToken}` },
            timeout: 8000,
          });
          const blocks = res.data?.results || [];
          if (blocks.length > 0) {
            const markdownLines = blocks.map((b) => {
              const type = b.type;
              const text = b[type]?.rich_text?.[0]?.plain_text || "";
              if (type === "heading_1") return `# ${text}`;
              if (type === "heading_2") return `## ${text}`;
              if (type === "heading_3") return `### ${text}`;
              if (type === "bulleted_list_item") return `- ${text}`;
              if (type === "to_do") return `- [${b[type]?.checked ? "x" : " "}] ${text}`;
              if (type === "callout") return `> ℹ️ ${text}`;
              return text;
            }).filter(Boolean);
            return markdownLines.join("\n\n");
          }
        }
      } catch (err) {
        console.warn(`⚠️ Notion get_page API failed (${err?.message}), using mock fallback...`);
      }

      return JSON.stringify({
        status: "UNAVAILABLE",
        service: "notion",
        page_id,
        reason: "NOTION_NOT_CONFIGURED_OR_UNREACHABLE",
        message: `Unable to retrieve Notion page ${page_id}. Configure NOTION_API_KEY in Admin Settings.`,
      });
    },
  });

  const notionQueryDatabaseTool = new DynamicStructuredTool({
    name: "notion_query_database",
    description: "Query structured Notion database (e.g. OKRs, Roadmaps, Competency Matrix).",
    schema: z.object({
      database_id: z.string().describe("Notion database UUID"),
    }),
    func: async ({ database_id }) => {
      const activeToken = token || settingsService.getCachedSettings()?.mcp?.notion?.apiKey || process.env.NOTION_API_KEY || null;
      if (activeToken) {
        try {
          const res = await axios.post(
            `https://api.notion.com/v1/databases/${database_id.replace(/-/g, "")}/query`,
            { page_size: 20 },
            { headers: { ...headers, Authorization: `Bearer ${activeToken}` }, timeout: 8000 }
          );
          if (res.data?.results?.length > 0) {
            return JSON.stringify({ database_id, records: res.data.results, source: "notion_live_api" }, null, 2);
          }
        } catch (err) {
          console.warn(`⚠️ Notion query_database API failed (${err?.message})`);
        }
      }
      return JSON.stringify({
        status: "UNAVAILABLE",
        service: "notion",
        database_id,
        reason: "NOTION_NOT_CONFIGURED_OR_UNREACHABLE",
        message: `Unable to query Notion database ${database_id}. Configure NOTION_API_KEY in Admin Settings.`,
        records: [],
      }, null, 2);
    },
  });

  return [notionSearchTool, notionGetPageTool, notionQueryDatabaseTool];
}

async function ensureInit() {
  if (initialized && tools.length > 0) return;
  const { notion } = getMcpConfig();
  const rawSettings = settingsService.getCachedSettings()?.mcp?.notion || {};

  const url = process.env.NOTION_MCP_URL || rawSettings.mcpUrl || notion.mcpUrl;
  const token = process.env.NOTION_API_KEY || rawSettings.apiKey || notion.apiKey;
  const isInternalSecret = typeof token === 'string' && token.startsWith("secret_");

  // Only attempt Remote MCP if an explicit MCP URL is configured AND we have a verified OAuth token or Bearer token (not an internal secret)
  let hasValidAuth = false;
  let serverConfig = null;

  if (url && url.startsWith("http") && !url.includes("localhost:0") && !isInternalSecret) {
    serverConfig = { url };
    if (notion.oauth?.enabled || rawSettings.oauth?.enabled) {
      const provider = new NotionOAuthProvider();
      const tokens = await provider.tokens().catch(() => null);
      if (tokens?.access_token) {
        serverConfig.authProvider = provider;
        hasValidAuth = true;
      }
    } else if (token && !token.startsWith("secret_")) {
      serverConfig.headers = { Authorization: `Bearer ${token}` };
      hasValidAuth = true;
    }
  }

  if (hasValidAuth && serverConfig) {
    try {
      client = new MultiServerMCPClient({
        mcpServers: { notion: serverConfig },
      });
      tools = await client.getTools();
      if (tools.length > 0) {
        initialized = true;
        console.log("✅ Successfully initialized Remote Notion MCP tools");
        return;
      }
    } catch (err) {
      console.warn("⚠️ Remote Notion MCP connection failed, falling back to Native Notion REST tools:", err?.message);
    }
  }

  tools = createNativeNotionTools(token);
  initialized = true;
  console.log(`✅ Loaded ${tools.length} Native Notion REST API tools`);
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
