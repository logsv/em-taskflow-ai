/**
 * Notion MCP Tool Harness (GoF Adapter / Facade Pattern)
 * Declarative DynamicStructuredTools wrapping the unified NotionClient.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import notionClient from "../integrations/clients/NotionClient.js";
import { info, warn, debug } from "../utils/logger.js";

export function createNativeNotionTools() {
  const notionSearchTool = new DynamicStructuredTool({
    name: "notion_search",
    description: "Search Notion workspace for sprint goals, team working agreements, engineering SOPs, and meeting notes.",
    schema: z.object({
      query: z.string().default("sprint goals working agreements").describe("Search query string"),
    }),
    func: async ({ query = "sprint goals working agreements" }) => {
      try {
        debug({ module: "notionMCP", action: "notion_search", query }, `Executing notion_search: query="${query}"`);
        const searchRes = await notionClient.search(query, { pageSize: 10 });
        const results = searchRes?.results || [];

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
      } catch (err) {
        warn({ module: "notionMCP", action: "notion_search_error", err: err.message }, "Notion search failed or unconfigured");
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "notion",
          reason: "NOTION_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Notion search failed: ${err.message}. Configure NOTION_API_KEY in Admin Settings.`,
          results: [],
        }, null, 2);
      }
    },
  });

  const notionGetPageTool = new DynamicStructuredTool({
    name: "notion_get_page",
    description: "Retrieve complete content, blocks, and headings from a specific Notion document.",
    schema: z.object({
      page_id: z.string().describe("Notion page ID or URL"),
    }),
    func: async ({ page_id }) => {
      try {
        debug({ module: "notionMCP", action: "notion_get_page", page_id }, `Executing notion_get_page: ${page_id}`);
        const pageData = await notionClient.getPageContent(page_id);
        if (!pageData) {
          throw new Error(`Page ${page_id} not found`);
        }

        const blocks = pageData.blocks || [];
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

        return `# ${pageData.title}\n\n*No block content found.*`;
      } catch (err) {
        warn({ module: "notionMCP", action: "notion_get_page_error", page_id, err: err.message }, `Unable to retrieve Notion page ${page_id}`);
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "notion",
          page_id,
          reason: "NOTION_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Unable to retrieve Notion page ${page_id}: ${err.message}. Configure NOTION_API_KEY in Admin Settings.`,
        });
      }
    },
  });

  const notionQueryDatabaseTool = new DynamicStructuredTool({
    name: "notion_query_database",
    description: "Query structured Notion database (e.g. OKRs, Roadmaps, Competency Matrix).",
    schema: z.object({
      database_id: z.string().describe("Notion database UUID"),
    }),
    func: async ({ database_id }) => {
      try {
        debug({ module: "notionMCP", action: "notion_query_database", database_id }, `Executing notion_query_database: ${database_id}`);
        const res = await notionClient.queryDatabase(database_id, { pageSize: 20 });
        const records = res?.results || [];
        return JSON.stringify({ database_id, records, source: "notion_live_api" }, null, 2);
      } catch (err) {
        warn({ module: "notionMCP", action: "notion_query_database_error", database_id, err: err.message }, `Notion query_database failed for ${database_id}`);
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "notion",
          database_id,
          reason: "NOTION_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Unable to query Notion database ${database_id}: ${err.message}. Configure NOTION_API_KEY in Admin Settings.`,
          records: [],
        }, null, 2);
      }
    },
  });

  return [notionSearchTool, notionGetPageTool, notionQueryDatabaseTool];
}

let cachedTools = null;

export async function getNotionTools() {
  if (!cachedTools) {
    cachedTools = createNativeNotionTools();
    info({ module: "notionMCP", action: "getNotionTools", toolCount: cachedTools.length }, `Initialized ${cachedTools.length} Native Notion REST tools`);
  }
  return cachedTools;
}

export async function closeNotionMcp() {
  cachedTools = null;
}

export default getNotionTools;
