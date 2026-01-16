import { ReliableMCPClient, loadMcpTools } from "./client.js";
import { config, getMcpConfig } from "../config.js";
import { getChatOllama } from "../llm/index.js";
import { ChatOpenAI } from "@langchain/openai";

let mcpClient = null;
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

    const { tools, client, toolsByServer } = await loadMcpTools();
    mcpClient = client;
    mcpTools = tools;

    jiraMcpTools = toolsByServer.atlassian || [];
    notionMcpTools = toolsByServer.notion || [];
    githubMcpTools = toolsByServer.github || [];

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
  return mcpClient;
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
  if (!mcpClient) {
    return {
      jiraTools: [],
      githubTools: [],
      notionTools: [],
      otherTools: allTools,
    };
  }

  const jiraTools = mcpClient.getToolsByServer("atlassian");
  const notionTools = mcpClient.getToolsByServer("notion");
  const githubTools = mcpClient.getToolsByServer("github");

  const usedNames = new Set([
    ...jiraTools.map((t) => t.name),
    ...notionTools.map((t) => t.name),
    ...githubTools.map((t) => t.name),
  ]);

  const otherTools = allTools.filter((tool) => !usedNames.has(tool.name));

  return {
    jiraTools,
    githubTools,
    notionTools,
    otherTools,
  };
}

export function getMCPToolsByServer(serverName) {
  if (!mcpClient) return [];
  return mcpClient.getToolsByServer(serverName);
}

export async function executeMCPTool(toolName, parameters) {
  if (!mcpClient) {
    throw new Error("MCP client not initialized");
  }

  try {
    console.log(`🔧 Executing MCP tool: ${toolName}`);
    const result = await mcpClient.executeTool(toolName, parameters);
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
  return isInitialized && mcpClient !== null && mcpClient.isReady();
}

export async function getMCPServerStatus() {
  if (!mcpClient) {
    return {
      notion: { connected: false, toolCount: 0 },
      google: { connected: false, toolCount: 0 },
      atlassian: { connected: false, toolCount: 0 },
    };
  }

  return await mcpClient.getServerStatus();
}

export async function getMCPHealthStatus() {
  if (!mcpClient) {
    return {
      healthy: false,
      servers: {},
      totalTools: 0,
      llmAvailable: false,
    };
  }

  const health = await mcpClient.healthCheck();
  return {
    ...health,
    llmAvailable: llm !== null,
  };
}

export async function reconnectMCP() {
  console.log("🔄 Reconnecting MCP servers...");

  if (mcpClient) {
    try {
      await mcpClient.reconnect();
      mcpTools = mcpClient.getTools();
      const toolsByServer = mcpClient.getAllToolsByServer
        ? mcpClient.getAllToolsByServer()
        : {};

      jiraMcpTools = toolsByServer.atlassian || [];
      notionMcpTools = toolsByServer.notion || [];
      githubMcpTools = toolsByServer.github || [];

      console.log(
        `✅ MCP reconnected with ${mcpTools.length} tools (Jira: ${jiraMcpTools.length}, GitHub: ${githubMcpTools.length}, Notion: ${notionMcpTools.length})`,
      );
    } catch (error) {
      console.error("❌ MCP reconnection failed:", error);
      throw error;
    }
  } else {
    await initializeMCP();
  }
}

export async function closeMCP() {
  if (mcpClient) {
    try {
      await mcpClient.close();
      console.log("✅ MCP connections closed");
    } catch (error) {
      console.error("❌ Error closing MCP:", error);
    }
  }

  isInitialized = false;
  mcpClient = null;
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
