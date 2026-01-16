import { config, getMcpConfig } from "../config.js";
import { ChatOpenAI } from "@langchain/openai";

let mcpTools = [];
let jiraMcpTools = [];
let notionMcpTools = [];
let githubMcpTools = [];
let llm = null;
let isInitialized = false;

export async function initializeMCP() {
  if (isInitialized) return;

  try {
    console.log("🚀 Initializing MCP MultiServer client...");

    const mcpConfig = getMcpConfig();
    console.log("🔧 MCP Configuration:");
    console.log("  Notion:", mcpConfig.notion.enabled ? "✅ Enabled" : "❌ Disabled");
    console.log("  Jira:", mcpConfig.jira.enabled ? "✅ Enabled" : "❌ Disabled");
    console.log("  Google:", mcpConfig.google.enabled ? "✅ Enabled" : "❌ Disabled");

    const jiraModule = await import("./jira.js").catch(() => null);
    const notionModule = await import("./notion.js").catch(() => null);
    const githubModule = await import("./github.js").catch(() => null);

    jiraMcpTools = jiraModule ? await jiraModule.getJiraTools().catch(() => []) : [];
    notionMcpTools = notionModule ? await notionModule.getNotionTools().catch(() => []) : [];
    githubMcpTools = githubModule ? await githubModule.getGithubTools().catch(() => []) : [];
    mcpTools = [...jiraMcpTools, ...notionMcpTools, ...githubMcpTools];

    console.log(
      `📋 Loaded ${mcpTools.length} MCP tools (Jira: ${jiraMcpTools.length}, GitHub: ${githubMcpTools.length}, Notion: ${notionMcpTools.length})`,
    );

    const llmConfig = config.llm;
    const openaiProvider = llmConfig.providers.openai;
    if (openaiProvider.enabled && openaiProvider.apiKey) {
      try {
        llm = new ChatOpenAI({
          modelName: "gpt-4o-mini",
          openAIApiKey: openaiProvider.apiKey,
          configuration: {
            baseURL: openaiProvider.baseUrl,
          },
          temperature: 0.1,
        });
        console.log("✅ Using OpenAI for MCP tool calling");
      } catch (error) {
        console.warn("⚠️  OpenAI initialization failed, will use Ollama");
      }
    }

    isInitialized = true;
    console.log(`✅ MCP MultiServer initialized with ${mcpTools.length} tools`);
  } catch (error) {
    console.error("❌ Failed to initialize MCP MultiServer:", error);
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
    otherTools: allTools.filter(
      (tool) =>
        ![...jiraMcpTools, ...githubMcpTools, ...notionMcpTools].some((t) => t.name === tool.name),
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
    default:
      return [];
  }
}

export async function executeMCPTool(toolName, parameters) {
  try {
    console.log(`🔧 Executing MCP tool: ${toolName}`);
    const tool =
      jiraMcpTools.find((t) => t.name === toolName) ||
      notionMcpTools.find((t) => t.name === toolName) ||
      githubMcpTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }
    const result = await tool.invoke(parameters);
    console.log(`✅ MCP tool completed: ${toolName}`);
    return result;
  } catch (error) {
    console.error(`❌ MCP tool failed: ${toolName}:`, error);
    throw error;
  }
}

export function getMCPLLM() {
  return llm;
}

export function isMCPReady() {
  return isInitialized && mcpTools.length > 0;
}

export async function getMCPServerStatus() {
  return {
    notion: { connected: notionMcpTools.length > 0, toolCount: notionMcpTools.length },
    github: { connected: githubMcpTools.length > 0, toolCount: githubMcpTools.length },
    atlassian: { connected: jiraMcpTools.length > 0, toolCount: jiraMcpTools.length },
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
  console.log("🔄 Reconnecting MCP servers...");

  try {
    await closeMCP();
    await initializeMCP();
  } catch (error) {
    console.error("❌ MCP reconnection failed:", error);
    throw error;
  }
}

export async function closeMCP() {
  const jiraModule = await import("./jira.js").catch(() => null);
  const notionModule = await import("./notion.js").catch(() => null);
  const githubModule = await import("./github.js").catch(() => null);

  const closers = [];
  if (jiraModule?.closeJiraMcp) closers.push(jiraModule.closeJiraMcp());
  if (notionModule?.closeNotionMcp) closers.push(notionModule.closeNotionMcp());
  if (githubModule?.closeGithubMcp) closers.push(githubModule.closeGithubMcp());
  if (closers.length) {
    await Promise.all(closers);
  }

  isInitialized = false;
  mcpTools = [];
  jiraMcpTools = [];
  notionMcpTools = [];
  githubMcpTools = [];
  llm = null;
}

export async function ensureMCPReady() {
  if (!isInitialized) {
    await initializeMCP();
  }
}
