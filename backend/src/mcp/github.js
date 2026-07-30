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
        const res = await axios.get(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}`, { headers });
        const items = res.data?.items || [];
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
      } catch (err) {
        console.error("❌ GitHub search_issues failed:", err?.response?.data || err?.message);
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
        console.error("❌ GitHub issue_read failed:", err?.response?.data || err?.message);
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
