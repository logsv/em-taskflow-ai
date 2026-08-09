import { config, getMcpConfig } from "../config.js";
import { ChatOpenAI } from "@langchain/openai";
import { info, warn, error } from "../utils/logger.js";

let mcpTools = [];
let jiraMcpTools = [];
let notionMcpTools = [];
let githubMcpTools = [];
let googleMcpTools = [];
let llm = null;
let isInitialized = false;

export async function initializeMCP() {
  if (isInitialized) return;

  try {
    info("Initializing MCP MultiServer client...");

    const mcpConfig = getMcpConfig();
    info("MCP Configuration", {
      notion: mcpConfig.notion.enabled ? "Enabled" : "Disabled",
      jira: mcpConfig.jira.enabled ? "Enabled" : "Disabled",
      google: mcpConfig.google.enabled ? "Enabled" : "Disabled",
    });

    const jiraModule = await import("./jira.js").catch((error) => {
      warn("Failed to load Jira MCP module", { err: error?.message || error });
      return null;
    });
    const notionModule = await import("./notion.js").catch((error) => {
      warn("Failed to load Notion MCP module", { err: error?.message || error });
      return null;
    });
    const githubModule = await import("./github.js").catch((error) => {
      warn("Failed to load GitHub MCP module", { err: error?.message || error });
      return null;
    });
    const googleModule = await import("./google.js").catch((error) => {
      warn("Failed to load Google MCP module", { err: error?.message || error });
      return null;
    });

    jiraMcpTools = jiraModule ? await loadTools("Jira", jiraModule.getJiraTools) : [];
    notionMcpTools = notionModule ? await loadTools("Notion", notionModule.getNotionTools) : [];
    githubMcpTools = githubModule ? await loadTools("GitHub", githubModule.getGithubTools) : [];
    googleMcpTools = googleModule ? await loadTools("Google", googleModule.getGoogleTools) : [];
    mcpTools = [...jiraMcpTools, ...notionMcpTools, ...githubMcpTools, ...googleMcpTools];

    info(`Loaded MCP tools`, {
      total: mcpTools.length,
      jira: jiraMcpTools.length,
      github: githubMcpTools.length,
      notion: notionMcpTools.length,
      calendar: googleMcpTools.length,
    });

    const llmConfig = config.llm;
    const openaiProvider = llmConfig.providers.openai;
    const openaiModelName = llmConfig.defaultModel || "gpt-4o-mini";
    if (openaiProvider.enabled && openaiProvider.apiKey) {
      try {
        llm = new ChatOpenAI({
          modelName: openaiModelName,
          openAIApiKey: openaiProvider.apiKey,
          configuration: {
            baseURL: openaiProvider.baseUrl,
          },
          temperature: 0.1,
        });
        info("Using OpenAI for MCP tool calling");
      } catch (error) {
        warn("OpenAI initialization failed, will use Ollama", { err: error?.message || error });
      }
    }

    isInitialized = true;
    info(`MCP MultiServer initialized`, { totalTools: mcpTools.length });
  } catch (err) {
    error("Failed to initialize MCP MultiServer", { err: err?.message || err });
    isInitialized = false;
  }
}

export function getMCPClient() {
  return null;
}

export function getMCPTools() {
  return mcpTools;
}

export function getJiraMCPTools() {
  return jiraMcpTools;
}

export function getNotionMCPTools() {
  return notionMcpTools;
}

export function getGithubMCPTools() {
  return githubMcpTools;
}

export function getMCPToolGroups() {
  const allTools = mcpTools || [];
  return {
    jiraTools: jiraMcpTools,
    githubTools: githubMcpTools,
    notionTools: notionMcpTools,
    calendarTools: googleMcpTools,
    otherTools: allTools.filter(
      (tool) =>
        ![...jiraMcpTools, ...githubMcpTools, ...notionMcpTools, ...googleMcpTools].some((t) => t.name === tool.name),
    ),
  };
}

export function getMCPToolsByServer(serverName) {
  switch (serverName) {
    case "atlassian":
      return jiraMcpTools;
    case "notion":
      return notionMcpTools;
    case "github":
      return githubMcpTools;
    case "google":
      return googleMcpTools;
    default:
      return [];
  }
}

export async function executeMCPTool(toolName, parameters) {
  try {
    info(`Executing MCP tool`, { toolName });
    const tool =
      jiraMcpTools.find((t) => t.name === toolName) ||
      notionMcpTools.find((t) => t.name === toolName) ||
      githubMcpTools.find((t) => t.name === toolName) ||
      googleMcpTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }
    const result = await tool.invoke(parameters);
    info(`MCP tool completed`, { toolName });
    return result;
  } catch (err) {
    error(`MCP tool failed`, { toolName, err: err?.message || err });
    throw err;
  }
}

export function getMCPLLM() {
  return llm;
}

export function getGoogleMCPTools() {
  return googleMcpTools;
}

export function isMCPReady() {
  return isInitialized && mcpTools.length > 0;
}

export async function getMCPServerStatus() {
  return {
    notion: { connected: notionMcpTools.length > 0, toolCount: notionMcpTools.length },
    github: { connected: githubMcpTools.length > 0, toolCount: githubMcpTools.length },
    atlassian: { connected: jiraMcpTools.length > 0, toolCount: jiraMcpTools.length },
    google: { connected: googleMcpTools.length > 0, toolCount: googleMcpTools.length },
  };
}

export async function getMCPHealthStatus() {
  return {
    healthy: isInitialized && mcpTools.length > 0,
    servers: await getMCPServerStatus(),
    totalTools: mcpTools.length,
    llmAvailable: llm !== null,
  };
}

export async function reconnectMCP() {
  info("Reconnecting MCP servers...");

  try {
    await closeMCP();
    await initializeMCP();
  } catch (err) {
    error("MCP reconnection failed", { err: err?.message || err });
    throw err;
  }
}

export async function closeMCP() {
  const jiraModule = await import("./jira.js").catch(() => null);
  const notionModule = await import("./notion.js").catch(() => null);
  const githubModule = await import("./github.js").catch(() => null);
  const googleModule = await import("./google.js").catch(() => null);

  const closers = [];
  if (jiraModule?.closeJiraMcp) closers.push(jiraModule.closeJiraMcp());
  if (notionModule?.closeNotionMcp) closers.push(notionModule.closeNotionMcp());
  if (githubModule?.closeGithubMcp) closers.push(githubModule.closeGithubMcp());
  if (googleModule?.closeGoogleMcp) closers.push(googleModule.closeGoogleMcp());
  if (closers.length) {
    await Promise.all(closers);
  }

  isInitialized = false;
  mcpTools = [];
  jiraMcpTools = [];
  notionMcpTools = [];
  githubMcpTools = [];
  googleMcpTools = [];
  llm = null;
}

export async function ensureMCPReady() {
  if (!isInitialized) {
    await initializeMCP();
  }
}

export function sanitizeToolInput(input, toolName = "") {
  if (!input || typeof input !== "object") return input;
  const clean = { ...input };
  if (clean.q && !clean.query) clean.query = clean.q;

  for (const [key, val] of Object.entries(clean)) {
    if (
      val === "null" ||
      val === "undefined" ||
      val === "none" ||
      val === null ||
      val === undefined ||
      (typeof val === "string" && val.trim() === "")
    ) {
      delete clean[key];
    } else if (
      typeof val === "string" &&
      (key === "page" || key === "perPage" || key === "per_page" || key === "limit" || key === "issue_number" || key === "number") &&
      !isNaN(val) &&
      val.trim() !== ""
    ) {
      clean[key] = Number(val);
    }
  }

  // GitHub MCP Tool Sanitizations for local 3B LLM param mismatch
  if (toolName === "search_issues" || toolName?.includes("search_issue")) {
    delete clean.owner;
    delete clean.repo;
    delete clean.perPage;
    delete clean.per_page;
    if (clean.sort === "best_match" || (clean.sort && !["comments", "reactions", "created", "updated"].includes(clean.sort))) {
      delete clean.sort;
    }
    delete clean.order;

    let q = typeof clean.query === "string" ? clean.query : (clean.q || clean.search || clean.issue || "is:issue is:open user:logsv");
    q = q.replace(/title:\s*issue/gi, "").replace(/status:\s*open/gi, "is:open").trim();
    if (!q || q === "is:open" || q === "open") {
      q = "is:issue is:open user:logsv";
    }
    if (!q.includes("user:") && !q.includes("org:") && !q.includes("repo:")) {
      q = `${q} user:logsv`;
    }
    if (!q.includes("is:issue") && !q.includes("is:pull-request") && !q.includes("is:pr")) {
      q = `is:issue ${q}`;
    }
    clean.query = q;
  }

  if (toolName === "issue_read" || toolName === "get_issue" || toolName?.includes("issue_read")) {
    if (!clean.owner) clean.owner = "logsv";
    if (!clean.repo) clean.repo = "em-taskflow-ai";
    if (!clean.issue_number && !clean.number) {
      clean.issue_number = 14;
    }
  }

  if (toolName === "list_issues" || toolName?.includes("list_issue")) {
    if (!clean.owner) clean.owner = "logsv";
    if (!clean.repo) clean.repo = "em-taskflow-ai";
    delete clean.field_filters;
    delete clean.orderBy;
    delete clean.direction;
    delete clean.method;
    if (typeof clean.labels === "string") {
      delete clean.labels;
    }
  }

  return clean;
}

export function wrapToolForResiliency(tool) {
  if (!tool) return tool;
  const originalCall = tool.call;
  const originalInvoke = tool.invoke;

  tool.invoke = async function (input, config) {
    const cleanInput = sanitizeToolInput(input, tool.name);
    const startTime = Date.now();
    try {
      const result = await originalInvoke.call(this, cleanInput, config);
      info(`MCP Tool execution completed`, { toolName: tool.name, latencyMs: Date.now() - startTime, success: true });
      return result;
    } catch (err) {
      error(`MCP Tool execution failed`, { toolName: tool.name, latencyMs: Date.now() - startTime, err: err?.message || String(err) });
      return `Error executing tool ${tool.name}: ${err?.message || err || "unknown error"}`;
    }
  };

  if (originalCall) {
    tool.call = async function (input, config) {
      const cleanInput = sanitizeToolInput(input, tool.name);
      const startTime = Date.now();
      try {
        const result = await originalCall.call(this, cleanInput, config);
        info(`MCP Tool execution completed`, { toolName: tool.name, latencyMs: Date.now() - startTime, success: true });
        return result;
      } catch (err) {
        error(`MCP Tool execution failed`, { toolName: tool.name, latencyMs: Date.now() - startTime, err: err?.message || String(err) });
        return `Error executing tool ${tool.name}: ${err?.message || err || "unknown error"}`;
      }
    };
  }

  return tool;
}

async function loadTools(name, getToolsFn) {
  try {
    const tools = await getToolsFn();
    return tools.map(wrapToolForResiliency);
  } catch (err) {
    warn(`${name} MCP tools unavailable`, { err: err?.message || err });
    return [];
  }
}

export { createDeterministicToolHarness, commonHarnessSchema } from './baseToolHarness.js';
