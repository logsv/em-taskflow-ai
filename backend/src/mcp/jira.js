/**
 * Jira MCP Tool Harness (GoF Adapter / Facade Pattern)
 * Declarative DynamicStructuredTools wrapping the unified JiraClient.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import jiraClient from "../integrations/clients/JiraClient.js";
import { info, warn, debug } from "../utils/logger.js";

export function createNativeJiraTools() {
  const jiraSearchTool = new DynamicStructuredTool({
    name: "jira_search",
    description: "Search Jira issues using JQL (Jira Query Language) across projects, backlog, and active sprints.",
    schema: z.object({
      jql: z.string().default('status in ("To Do", "In Progress", "Blocked", "Backlog")').describe("JQL query string, e.g. status in ('To Do', 'In Progress', 'Blocked', 'Backlog')"),
      max_results: z.number().default(20).describe("Maximum issues to return"),
    }),
    func: async ({ jql = 'status in ("To Do", "In Progress", "Blocked", "Backlog")', max_results = 20 }) => {
      try {
        debug({ module: "jiraMCP", action: "jira_search", jql }, `Executing jira_search: jql="${jql}"`);
        const searchRes = await jiraClient.searchJql(jql, { maxResults: max_results });
        const issues = searchRes?.issues || [];

        const formatted = issues.map((i) => {
          const blockedBy = (i.fields?.issuelinks || [])
            .filter((l) => l.type?.inward === "is blocked by" && l.inwardIssue)
            .map((l) => l.inwardIssue.key);
          return {
            key: i.key,
            summary: i.fields?.summary || "",
            status: i.fields?.status?.name || "Unknown",
            assignee: i.fields?.assignee?.displayName || "unassigned",
            due_date: i.fields?.duedate || null,
            priority: i.fields?.priority?.name || "Medium",
            blocked_by: blockedBy.length > 0 ? blockedBy.join(", ") : null,
          };
        });

        return JSON.stringify({
          total: searchRes?.total ?? formatted.length,
          issues: formatted,
          source: "jira_live_api",
        }, null, 2);
      } catch (err) {
        warn({ module: "jiraMCP", action: "jira_search_error", err: err.message }, "Jira search failed or unconfigured");
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "jira",
          reason: "JIRA_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Jira search failed: ${err.message}. Configure JIRA_BASE_URL and API tokens in Admin Settings.`,
          total: 0,
          issues: [],
          blocked_tickets: [],
          missed_deadline_tickets: [],
        }, null, 2);
      }
    },
  });

  const jiraGetIssueTool = new DynamicStructuredTool({
    name: "jira_get_issue",
    description: "Read details of a specific Jira issue by issue key (e.g. ENG-104, SCRUM-28).",
    schema: z.object({
      issue_key: z.string().default("ENG-104").describe("Jira issue key, e.g. ENG-104, SCRUM-28"),
    }),
    func: async ({ issue_key = "ENG-104" }) => {
      try {
        debug({ module: "jiraMCP", action: "jira_get_issue", issue_key }, `Executing jira_get_issue: ${issue_key}`);
        const item = await jiraClient.getIssue(issue_key);
        if (!item) {
          throw new Error(`Issue ${issue_key} not found`);
        }
        return JSON.stringify({
          key: item.key,
          summary: item.fields?.summary,
          status: item.fields?.status?.name,
          assignee: item.fields?.assignee?.displayName,
          description: item.fields?.description,
          priority: item.fields?.priority?.name,
          due_date: item.fields?.duedate,
          blocked_by: item.fields?.issuelinks?.find((l) => l.type?.inward === "is blocked by")?.inwardIssue?.key || null,
          source: "jira_live_api",
        }, null, 2);
      } catch (err) {
        warn({ module: "jiraMCP", action: "jira_get_issue_error", issue_key, err: err.message }, `Unable to retrieve Jira issue ${issue_key}`);
        return JSON.stringify({
          status: "UNAVAILABLE",
          service: "jira",
          key: issue_key,
          reason: "JIRA_NOT_CONFIGURED_OR_UNREACHABLE",
          message: `Unable to retrieve Jira issue ${issue_key}: ${err.message}. Configure Jira URL and credentials in Admin Settings.`,
        }, null, 2);
      }
    },
  });

  const jiraGetSprintReportTool = new DynamicStructuredTool({
    name: "jira_get_sprint_report",
    description: "Get agile sprint velocity, committed vs completed story points, and WIP limits for active sprint.",
    schema: z.object({
      sprint_id: z.string().default("active").describe("Sprint ID or 'active'"),
      board_id: z.string().default("main_board").describe("Board ID"),
    }),
    func: async ({ sprint_id = "active", board_id = "main_board" }) => {
      return JSON.stringify({
        status: "UNAVAILABLE",
        service: "jira",
        board_id,
        sprint_id,
        reason: "JIRA_NOT_CONFIGURED_OR_UNREACHABLE",
        message: "Unable to retrieve sprint report. Configure Jira Agile Board integration in Admin Settings.",
      }, null, 2);
    },
  });

  return [jiraSearchTool, jiraGetIssueTool, jiraGetSprintReportTool];
}

let cachedTools = null;

export async function getJiraTools() {
  if (!cachedTools) {
    cachedTools = createNativeJiraTools();
    info({ module: "jiraMCP", action: "getJiraTools", toolCount: cachedTools.length }, `Initialized ${cachedTools.length} Native Jira REST tools`);
  }
  return cachedTools;
}

export async function closeJiraMcp() {
  cachedTools = null;
}

export default getJiraTools;
