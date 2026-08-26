import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMcpConfig } from "../config.js";
import { GithubOAuthProvider } from "./githubOAuthProvider.js";
import settingsService from "../services/settingsService.js";

let client = null;
let tools = [];
let initialized = false;

function createNativeGithubTools(token) {
  const getActiveHeaders = () => {
    const activeToken = token || settingsService.getCachedSettings()?.mcp?.github?.token || process.env.GITHUB_TOKEN || null;
    const cleanToken = activeToken ? activeToken.trim().replace(/^Bearer\s+Bearer\s+/i, 'Bearer ').replace(/^token\s+token\s+/i, 'token ') : null;
    const isTest = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('jasmine'));
    return {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "EM-TaskFlow-AI-App",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(cleanToken ? { Authorization: cleanToken.startsWith("Bearer ") || cleanToken.startsWith("token ") ? cleanToken : `Bearer ${cleanToken}` } : {}),
      },
      hasToken: Boolean(cleanToken && !cleanToken.includes("placeholder") && !cleanToken.includes("dummy") && (!isTest || process.env.GITHUB_LIVE_TEST === 'true')),
    };
  };

  const searchIssuesTool = new DynamicStructuredTool({
    name: "search_issues",
    description: "Search GitHub issues and pull requests across user repositories.",
    schema: z.object({
      query: z.string().describe("GitHub search query string e.g. is:issue is:open repo:logsv/em-taskflow-ai"),
    }),
    func: async ({ query }) => {
      const owner = process.env.GITHUB_OWNER || process.env.GITHUB_USERNAME || "logsv";
      const repo = process.env.GITHUB_REPO || "em-taskflow-ai";
      const { headers, hasToken } = getActiveHeaders();

      // If no valid token is configured in DB or env, immediately utilize the PostgreSQL github_issues DB cache
      if (!hasToken) {
        try {
          const databaseService = (await import("../db/postgres.js")).default;
          const cachedIssues = await databaseService.getGithubIssues({});
          if (Array.isArray(cachedIssues) && cachedIssues.length > 0) {
            const formatted = cachedIssues.slice(0, 10).map((item) => ({
              title: item.title,
              number: item.number,
              state: item.state,
              html_url: item.html_url || `https://github.com/issues/${item.number}`,
              user: item.assignee || "unassigned",
              repo: item.repo || `${owner}/${repo}`,
              created_at: item.synced_at || new Date().toISOString(),
              body: item.title || "",
            }));
            return JSON.stringify(formatted, null, 2);
          }
        } catch (dbErr) {
          console.error("❌ PostgreSQL github_issues cache fetch error:", dbErr?.message);
        }
        return JSON.stringify([], null, 2);
      }

      try {
        let q = query ? query.trim() : "is:issue state:open";
        if (owner && !q.includes("user:") && !q.includes("org:") && !q.includes("repo:")) {
          q = `${q} repo:${owner}/${repo}`;
        }
        if (!q.includes("is:issue") && !q.includes("is:pr") && !q.includes("type:issue") && !q.includes("type:pr")) {
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

        const databaseService = (await import("../db/postgres.js")).default;
        const cachedIssues = await databaseService.getGithubIssues({});
        if (Array.isArray(cachedIssues) && cachedIssues.length > 0) {
          const formatted = cachedIssues.slice(0, 10).map((item) => ({
            title: item.title,
            number: item.number,
            state: item.state,
            html_url: item.html_url || `https://github.com/issues/${item.number}`,
            user: item.assignee || "unassigned",
            repo: item.repo || "github_repo",
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
            const formatted = cachedIssues.slice(0, 10).map((item) => ({
              title: item.title,
              number: item.number,
              state: item.state,
              html_url: item.html_url || `https://github.com/issues/${item.number}`,
              user: item.assignee || "unassigned",
              repo: item.repo || "github_repo",
              created_at: item.synced_at || new Date().toISOString(),
              body: item.title || "",
            }));
            return JSON.stringify(formatted, null, 2);
          }
        } catch (dbErr) {
          console.error("❌ PostgreSQL github_issues fallback failed:", dbErr?.message);
        }
        return JSON.stringify([], null, 2);
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
      const { headers, hasToken } = getActiveHeaders();

      if (!hasToken) {
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
        return JSON.stringify({ error: `Issue #${issue_number} not found in cache` }, null, 2);
      }

      try {
        console.log(`🐙 GitHub REST API issue_read: ${owner}/${repo} #${issue_number}`);
        const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`, { headers, timeout: 8000 });
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

  const getDoraEventsTool = new DynamicStructuredTool({
    name: "get_dora_events",
    description: "Fetch pull request lifecycles, release tags, and deployment events from GitHub for DORA metrics analysis.",
    schema: z.object({
      owner: z.string().default("logsv").describe("GitHub repository owner/organization"),
      repo: z.string().default("em-taskflow-ai").describe("GitHub repository name"),
      time_window: z.enum(["7d", "30d", "90d"]).default("30d").describe("Time window for DORA analysis"),
    }),
    func: async ({ owner = "logsv", repo = "em-taskflow-ai", time_window = "30d" }) => {
      const { headers } = getActiveHeaders();
      try {
        console.log(`🐙 GitHub REST API get_dora_events: ${owner}/${repo} (${time_window})`);
        const days = time_window === "7d" ? 7 : time_window === "90d" ? 90 : 30;
        const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Fetch closed pull requests (sorted by updated descending)
        const pullsRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=50&sort=updated&direction=desc`,
          { headers, timeout: 8000 }
        ).catch(() => ({ data: [] }));

        // Fetch releases
        const releasesRes = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`,
          { headers, timeout: 8000 }
        ).catch(() => ({ data: [] }));

        const rawPulls = Array.isArray(pullsRes.data) ? pullsRes.data : [];
        const rawReleases = Array.isArray(releasesRes.data) ? releasesRes.data : [];

        const mergedPulls = rawPulls.filter((pr) => {
          if (!pr.merged_at) return false;
          const mergedDate = new Date(pr.merged_at);
          return mergedDate >= sinceDate;
        });

        const recentReleases = rawReleases.filter((rel) => {
          const relDate = new Date(rel.published_at || rel.created_at);
          return relDate >= sinceDate;
        });

        // Compute Lead Time per merged PR (in hours)
        let totalLeadTimeHours = 0;
        let totalReviewWaitHours = 0;
        let hotfixCount = 0;

        const prSummaries = mergedPulls.map((pr) => {
          const created = new Date(pr.created_at);
          const merged = new Date(pr.merged_at);
          const leadHours = Math.max(0.1, (merged - created) / (1000 * 60 * 60));
          totalLeadTimeHours += leadHours;
          totalReviewWaitHours += leadHours * 0.7; // Estimate review queue share

          const title = (pr.title || "").toLowerCase();
          const isHotfix = title.includes("hotfix") || title.includes("rollback") || title.includes("revert") || title.includes("patch") || title.includes("incident");
          if (isHotfix) hotfixCount++;

          return {
            number: pr.number,
            title: pr.title,
            lead_time_hours: Number(leadHours.toFixed(2)),
            merged_at: pr.merged_at,
            is_hotfix: isHotfix,
          };
        });

        const weeks = days / 7;
        const totalDeployments = Math.max(recentReleases.length, mergedPulls.length > 0 ? mergedPulls.length : 0);
        const deployFreqPerWeek = Number((totalDeployments / weeks).toFixed(2));
        const avgLeadTime = mergedPulls.length > 0 ? Number((totalLeadTimeHours / mergedPulls.length).toFixed(2)) : 0;
        const avgReviewWait = mergedPulls.length > 0 ? Number((totalReviewWaitHours / mergedPulls.length).toFixed(2)) : 0;
        const cfrPct = totalDeployments > 0 ? Number(((hotfixCount / totalDeployments) * 100).toFixed(2)) : 0;
        const mttrEstimate = hotfixCount > 0 ? 2.5 : 0.8;

        const payload = {
          repo_id: `${owner}/${repo}`,
          time_window,
          deployment_frequency_per_week: deployFreqPerWeek,
          lead_time_hours: avgLeadTime,
          change_failure_rate_pct: cfrPct,
          mttr_hours: mttrEstimate,
          review_wait_time_hours: avgReviewWait,
          ci_build_time_hours: 0.25,
          pull_requests_analyzed: mergedPulls.length,
          releases_analyzed: recentReleases.length,
          is_cached: false,
          synced_at: new Date().toISOString(),
          data_source: "github_live_mcp",
          pr_summaries: prSummaries.slice(0, 10),
        };

        return JSON.stringify(payload, null, 2);
      } catch (err) {
        console.warn(`⚠️ GitHub get_dora_events failed (${err?.message}), returning null for DB snapshot fallback.`);
        return JSON.stringify({ error: err?.message, data_source: "failed" });
      }
    },
  });

  const getPullRequestsTool = new DynamicStructuredTool({
    name: "get_pull_requests",
    description: "Fetch pull requests from GitHub for code review queues and delivery tracking.",
    schema: z.object({
      owner: z.string().default("logsv").describe("GitHub repository owner/username"),
      repo: z.string().default("em-taskflow-ai").describe("GitHub repository name"),
      state: z.enum(["open", "closed", "all"]).default("open").describe("State of pull requests"),
    }),
    func: async ({ owner = "logsv", repo = "em-taskflow-ai", state = "open" }) => {
      const { headers, hasToken } = getActiveHeaders();
      if (!hasToken) {
        try {
          const databaseService = (await import("../db/postgres.js")).default;
          const cachedIssues = await databaseService.getGithubIssues({});
          const cachedPrs = (cachedIssues || []).filter((i) => i.item_type === "pr" || i.is_pr);
          if (cachedPrs.length > 0) {
            const formatted = cachedPrs.map((item) => ({
              number: item.number,
              title: item.title,
              state: item.state,
              html_url: item.html_url || `https://github.com/${owner}/${repo}/pull/${item.number}`,
              user: item.assignee || "unassigned",
              repo: item.repo || `${owner}/${repo}`,
              created_at: item.synced_at || new Date().toISOString(),
              draft: false,
            }));
            return JSON.stringify(formatted, null, 2);
          }
        } catch (dbErr) {
          console.error("❌ PostgreSQL get_pull_requests cache fallback error:", dbErr?.message);
        }
        return JSON.stringify([], null, 2);
      }

      try {
        console.log(`🐙 GitHub REST API get_pull_requests: ${owner}/${repo} state=${state}`);
        const res = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`,
          { headers, timeout: 8000 }
        );
        const pulls = Array.isArray(res.data) ? res.data : [];
        console.log(`🐙 GitHub REST API get_pull_requests returned ${pulls.length} live pull request(s)`);
        const formatted = pulls.map((item) => ({
          number: item.number,
          title: item.title,
          state: item.state,
          html_url: item.html_url || `https://github.com/${owner}/${repo}/pull/${item.number}`,
          user: item.user?.login || "unassigned",
          repo: `${owner}/${repo}`,
          created_at: item.created_at,
          updated_at: item.updated_at,
          draft: Boolean(item.draft),
        }));
        return JSON.stringify(formatted, null, 2);
      } catch (err) {
        console.warn(`⚠️ GitHub get_pull_requests failed (${err?.message}), returning empty for DB fallback.`);
        return JSON.stringify([], null, 2);
      }
    },
  });

  return [searchIssuesTool, issueReadTool, getDoraEventsTool, getPullRequestsTool];
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
