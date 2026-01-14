import { ReliableMCPClient, loadMcpTools } from "../mcp/client.js";
import { config, getMcpConfig } from "../config.js";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

class MCPService {
  constructor() {
    this.client = null;
    this.tools = [];
    this.isInitialized = false;
    this.llm = null;
  }

  async initialize() {
    try {
      console.log("🚀 Initializing MCP Service with LangChain MCP Adapters...");

      const mcpConfig = getMcpConfig();
      console.log("🔧 Configuration status:");
      console.log(
        "  Notion enabled:",
        mcpConfig.notion.enabled,
        "| API key:",
        mcpConfig.notion.apiKey ? "✅ Set" : "❌ Missing",
      );
      console.log(
        "  Jira enabled:",
        mcpConfig.jira.enabled,
        "| URL:",
        mcpConfig.jira.url ? "✅ Set" : "❌ Missing",
      );
      console.log(
        "  Google enabled:",
        mcpConfig.google.enabled,
        "| OAuth:",
        mcpConfig.google.oauthCredentials ? "✅ Set" : "❌ Missing",
      );

      const { tools, client } = await loadMcpTools();
      this.client = client;
      this.tools = tools;

      console.log(`📋 Loaded ${this.tools.length} MCP tools:`, this.tools.map((t) => t.name));

      await this.initializeLLM();

      this.isInitialized = true;
      console.log(`✅ MCP Service initialized with ${this.tools.length} tools and LLM support`);
    } catch (error) {
      console.error("❌ Failed to initialize MCP Service:", error);
      this.isInitialized = false;
    }
  }

  async initializeLLM() {
    const llmConfig = config.llm;

    if (llmConfig.providers.openai.enabled && llmConfig.providers.openai.apiKey) {
      try {
        this.llm = new ChatOpenAI({
          modelName: "gpt-4o-mini",
          apiKey: llmConfig.providers.openai.apiKey,
          temperature: 0.7,
        });
        console.log("✅ Using OpenAI LLM for tool calling");
        return;
      } catch (error) {
        console.warn("⚠️  Failed to initialize OpenAI LLM:", error);
      }
    }

    if (llmConfig.providers.ollama.enabled && llmConfig.providers.ollama.baseUrl) {
      try {
        const baseUrl = llmConfig.providers.ollama.baseUrl.includes("localhost")
          ? llmConfig.providers.ollama.baseUrl.replace("localhost", "127.0.0.1")
          : llmConfig.providers.ollama.baseUrl;

        this.llm = new ChatOllama({
          baseUrl,
          model: llmConfig.defaultModel || "gpt-oss:latest",
          temperature: 0.7,
        });
        console.log("✅ Using Ollama LLM for tool calling");
        return;
      } catch (error) {
        console.warn("⚠️  Failed to initialize Ollama LLM:", error);
      }
    }

    console.log("⚠️  No LLM initialized - tool calling will be limited to direct invocations");
  }

  async executeTool(toolName, parameters) {
    if (!this.client) {
      throw new Error("MCP Client not initialized");
    }

    try {
      console.log(`🔧 Executing MCP tool: ${toolName} with parameters:`, parameters);
      const result = await this.client.executeTool(toolName, parameters);
      console.log(`✅ Tool execution completed: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`❌ Tool execution failed: ${toolName}:`, error);
      throw error;
    }
  }

  async runQuery(query) {
    if (!this.llm) {
      throw new Error(
        "No LLM available for query processing. Direct tool execution is available via executeTool method.",
      );
    }

    if (this.tools.length === 0) {
      throw new Error("No MCP tools available. Check server connections.");
    }

    try {
      console.log("🧠 Running query with LLM and MCP tools:", query.slice(0, 100));

      const availableTools = this.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

      return `Query received: "${query}"\n\nAvailable MCP tools:\n${availableTools}\n\nNote: Enhanced tool calling with LangGraph coming soon!`;
    } catch (error) {
      console.error("❌ Query execution error:", error);
      throw error;
    }
  }

  getTools() {
    return this.tools;
  }

  getToolsByServer(serverName) {
    if (!this.client) {
      return [];
    }
    return this.client.getToolsByServer(serverName);
  }

  isReady() {
    return this.isInitialized && this.client !== null && this.client.isReady();
  }

  async getServerStatus() {
    if (!this.client) {
      return {
        notion: { connected: false, toolCount: 0 },
        google: { connected: false, toolCount: 0 },
        atlassian: { connected: false, toolCount: 0 },
      };
    }

    return await this.client.getServerStatus();
  }

  async getHealthStatus() {
    if (!this.client) {
      return {
        healthy: false,
        servers: {},
        totalTools: 0,
        llmAvailable: false,
      };
    }

    const health = await this.client.healthCheck();
    return {
      ...health,
      llmAvailable: this.llm !== null,
    };
  }

  async reconnect() {
    console.log("🔄 Reconnecting MCP Service...");

    if (this.client) {
      try {
        await this.client.reconnect();
        this.tools = this.client.getTools();
        console.log(`✅ Reconnected with ${this.tools.length} tools`);
      } catch (error) {
        console.error("❌ Failed to reconnect MCP service:", error);
        throw error;
      }
    } else {
      await this.initialize();
    }
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
        console.log("✅ MCP Service connections closed");
      } catch (error) {
        console.error("❌ Error closing MCP Service:", error);
      }
    }

    this.isInitialized = false;
    this.client = null;
    this.tools = [];
    this.llm = null;
  }

  async restart() {
    console.log("🔄 Restarting MCP Service...");
    await this.close();
    await this.initialize();
  }

  getClient() {
    return this.client;
  }

  getLLM() {
    return this.llm;
  }
}

const mcpService = new MCPService();

export default mcpService;
export { MCPService };

