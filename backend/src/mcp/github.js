import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";
import { GithubOAuthProvider } from "./githubOAuthProvider.js";

let client = null;
let tools = [];
let initialized = false;

function createNativeGithubTools(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const searchIssuesTool = new DynamicStructuredTool({
    name: "search_issues",
    description: "Search GitHub issues and pull requests across user repositories.",
    schema: z.object({
      query: z.string().describe("GitHub search query string e.g. is:issue is:open user:logsv"),
    }),
    func: async ({ query }) => {
      try {
        let q = query || "is:issue is:open user:logsv";
        if (!q.includes("user:") && !q.includes("org:") && !q.includes("repo:")) {
          q = `${q} user:logsv`;
        }
        if (!q.includes("is:issue") && !q.includes("is:pr")) {
          q = `is:issue ${q}`;
        }
        console.log(`🐙 GitHub REST API search_issues: query="${q}"`);
        const res = await axios.get(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}`, { headers, timeout: 8000 });
        const items = res.data?.items || [];
        if (items.length > 0) {
          console.log(`🐙 GitHub REST API search_issues returned ${items.length} live item(s)`);
          const formatted = items.slice(0, 10).map((item) => ({
            title: item.title,
            number: item.number,
            state: item.state,
            html_url: item.html_url,
            user: item.user?.login,
            repo: item.repository_url?.split("/").slice(-2).join("/"),
            created_at: item.created_at,
            body: item.body ? item.body.substring(0, 200) : "",
          }));
          return JSON.stringify(formatted, null, 2);
        }

        console.log(`📋 GitHub API search_issues returned 0 live items for "${q}". Attempting PostgreSQL github_issues DB fallback...`);
        const databaseService = (await import("../db/postgres.js")).default;
        const cachedIssues = await databaseService.getGithubIssues({});
        if (Array.isArray(cachedIssues) && cachedIssues.length > 0) {
          console.log(`📋 PostgreSQL github_issues DB cache returned ${cachedIssues.length} cached issue(s)`);
          const formatted = cachedIssues.slice(0, 10).map((item) => ({
            title: item.title,
            number: item.number,
            state: item.state,
            html_url: item.html_url || `https://github.com/logsv/em-taskflow-ai/issues/${item.number}`,
            user: item.assignee || "logsv",
            repo: item.repo || "logsv/em-taskflow-ai",
            created_at: item.synced_at || new Date().toISOString(),
            body: item.title || "",
          }));
          return JSON.stringify(formatted, null, 2);
        }

        return JSON.stringify([], null, 2);
      } catch (err) {
        console.warn(`⚠️ GitHub search_issues API call failed (${err?.message}), using PostgreSQL github_issues DB snapshot fallback...`);
        try {
          const databaseService = (await import("../db/postgres.js")).default;
          const cachedIssues = await databaseService.getGithubIssues({});
          if (Array.isArray(cachedIssues) && cachedIssues.length > 0) {
            console.log(`📋 PostgreSQL github_issues DB cache fallback returned ${cachedIssues.length} issue(s)`);
            const formatted = cachedIssues.slice(0, 10).map((item) => ({
              title: item.title,
              number: item.number,
              state: item.state,
              html_url: item.html_url || `https://github.com/logsv/em-taskflow-ai/issues/${item.number}`,
              user: item.assignee || "logsv",
              repo: item.repo || "logsv/em-taskflow-ai",
              created_at: item.synced_at || new Date().toISOString(),
              body: item.title || "",
            }));
            return JSON.stringify(formatted, null, 2);
          }
        } catch (dbErr) {
          console.error("❌ PostgreSQL github_issues fallback failed:", dbErr?.message);
        }
        return `GitHub search_issues error: ${err?.response?.data?.message || err?.message}`;
      }
    },
  });

  const issueReadTool = new DynamicStructuredTool({
    name: "issue_read",
    description: "Read details of a specific GitHub issue by owner, repo, and issue_number.",
    schema: z.object({
      owner: z.string().default("logsv").describe("GitHub repository owner/username"),
      repo: z.string().default("em-taskflow-ai").describe("GitHub repository name"),
      issue_number: z.number().describe("Issue number"),
    }),
    func: async ({ owner = "logsv", repo = "em-taskflow-ai", issue_number }) => {
      try {
        console.log(`🐙 GitHub REST API issue_read: ${owner}/${repo} #${issue_number}`);
        const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`, { headers });
        const item = res.data;
        return JSON.stringify(
          {
            title: item.title,
            number: item.number,
            state: item.state,
            html_url: item.html_url,
            user: item.user?.login,
            body: item.body,
            created_at: item.created_at,
            comments: item.comments,
          },
          null,
          2,
        );
      } catch (err) {
        console.warn(`⚠️ GitHub issue_read API failed (${err?.message}), using PostgreSQL github_issues DB fallback...`);
        try {
          const databaseService = (await import("../db/postgres.js")).default;
          const cachedIssues = await databaseService.getGithubIssues({ repo: `${owner}/${repo}` });
          const match = cachedIssues.find((i) => i.number === issue_number);
          if (match) {
            return JSON.stringify(
              {
                title: match.title,
                number: match.number,
                state: match.state,
                html_url: match.html_url,
                user: match.assignee || "logsv",
                body: match.title,
                created_at: match.synced_at,
                comments: 0,
              },
              null,
              2,
            );
          }
        } catch (dbErr) {
          console.error("❌ PostgreSQL github_issues fallback failed:", dbErr?.message);
        }
        return `GitHub issue_read error: ${err?.response?.data?.message || err?.message}`;
      }
    },
  });

  return [searchIssuesTool, issueReadTool];
}

async function ensureInit() {
  if (initialized && tools.length > 0) return;

  const { github } = getMcpConfig();
  const token = process.env.GITHUB_TOKEN || github.token;
  const url = process.env.GITHUB_MCP_URL || github.url;

  if (url && !url.includes("api.githubcopilot.com")) {
    try {
      const serverConfig = { url };
      if (token) serverConfig.headers = { Authorization: `Bearer ${token}` };
      client = new MultiServerMCPClient({ mcpServers: { github: serverConfig } });
      tools = await client.getTools();
      initialized = true;
      console.log("✅ Successfully initialized GitHub MCP remote tools");
      return;
    } catch (err) {
      console.warn("⚠️ Remote GitHub MCP connection failed, falling back to GitHub REST API tools:", err?.message);
    }
  }

  tools = createNativeGithubTools(token);
  initialized = true;
  console.log(`✅ Loaded ${tools.length} Native GitHub REST API tools`);
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
