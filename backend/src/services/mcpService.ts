import type { Tool } from '@langchain/core/tools';
import { ReliableMCPClient, loadMcpTools } from '../mcp/client.js';
import { config, getMcpConfig } from '../config.js';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Enhanced MCP Service using LangChain MCP Adapters
 * Provides reliable connections to multiple MCP servers with LangGraph-native tools
 */
class MCPService {
  private client: ReliableMCPClient | null = null;
  private tools: Tool[] = [];
  private isInitialized = false;
  private llm: ChatOpenAI | ChatOllama | null = null;

  /**
   * Initialize the MCP client with reliable LangChain adapters
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing MCP Service with LangChain MCP Adapters...');

      // Debug configuration values
      const mcpConfig = getMcpConfig();
      console.log('🔧 Configuration status:');
      console.log('  Notion enabled:', mcpConfig.notion.enabled, '| API key:', mcpConfig.notion.apiKey ? '✅ Set' : '❌ Missing');
      console.log('  Jira enabled:', mcpConfig.jira.enabled, '| URL:', mcpConfig.jira.url ? '✅ Set' : '❌ Missing');
      console.log('  Google enabled:', mcpConfig.google.enabled, '| OAuth:', mcpConfig.google.oauthCredentials ? '✅ Set' : '❌ Missing');

      // Initialize the reliable MCP client
      const { tools, client } = await loadMcpTools();
      this.client = client;
      this.tools = tools;

      console.log(`📋 Loaded ${this.tools.length} MCP tools:`, this.tools.map(t => t.name));

      // Initialize LLM for tool calling
      await this.initializeLLM();

      this.isInitialized = true;
      console.log(`✅ MCP Service initialized with ${this.tools.length} tools and LLM support`);

    } catch (error) {
      console.error('❌ Failed to initialize MCP Service:', error);
      this.isInitialized = false;
      // Don't throw - allow service to continue with limited functionality
    }
  }

  /**
   * Initialize LLM for tool calling
   */
  private async initializeLLM(): Promise<void> {
    const llmConfig = config.llm;
    const llmProvider = llmConfig.defaultProvider;

    // Try OpenAI first if enabled and API key available
    if (llmConfig.providers.openai.enabled && llmConfig.providers.openai.apiKey) {
      try {
        this.llm = new ChatOpenAI({
          modelName: 'gpt-4o-mini',
          apiKey: llmConfig.providers.openai.apiKey,
          temperature: 0.7,
        });
        console.log('✅ Using OpenAI LLM for tool calling');
        return;
      } catch (error) {
        console.warn('⚠️  Failed to initialize OpenAI LLM:', error);
      }
    }

    // Fall back to Ollama if available
    if (llmConfig.providers.ollama.enabled && llmConfig.providers.ollama.baseUrl) {
      try {
        const baseUrl = llmConfig.providers.ollama.baseUrl.includes('localhost')
          ? llmConfig.providers.ollama.baseUrl.replace('localhost', '127.0.0.1')
          : llmConfig.providers.ollama.baseUrl;

        this.llm = new ChatOllama({
          baseUrl,
          model: llmConfig.defaultModel || 'gpt-oss:latest',
          temperature: 0.7,
        });
        console.log('✅ Using Ollama LLM for tool calling');
        return;
      } catch (error) {
        console.warn('⚠️  Failed to initialize Ollama LLM:', error);
      }
    }

    console.log('⚠️  No LLM initialized - tool calling will be limited to direct invocations');
  }


  /**
   * Execute a tool by name with parameters
   */
  async executeTool(toolName: string, parameters: any): Promise<any> {
    if (!this.client) {
      throw new Error('MCP Client not initialized');
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

  /**
   * Run a query with LLM and available tools
   */
  async runQuery(query: string): Promise<string> {
    if (!this.llm) {
      throw new Error('No LLM available for query processing. Direct tool execution is available via executeTool method.');
    }

    if (this.tools.length === 0) {
      throw new Error('No MCP tools available. Check server connections.');
    }

    try {
      console.log('🧠 Running query with LLM and MCP tools:', query.slice(0, 100));

      // For now, return a simple message indicating available tools
      // In a full implementation, this would use LangGraph for tool calling
      const availableTools = this.tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
      
      return `Query received: "${query}"\n\nAvailable MCP tools:\n${availableTools}\n\nNote: Enhanced tool calling with LangGraph coming soon!`;

    } catch (error) {
      console.error('❌ Query execution error:', error);
      throw error;
    }
  }

  /**
   * Get all available MCP tools (LangChain-compatible)
   */
  getTools(): Tool[] {
    return this.tools;
  }

  /**
   * Get tools from a specific server
   */
  getToolsByServer(serverName: string): Tool[] {
    if (!this.client) {
      return [];
    }
    return this.client.getToolsByServer(serverName);
  }

  /**
   * Check if MCP service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null && this.client.isReady();
  }

  /**
   * Get detailed server connection status
   */
  async getServerStatus(): Promise<Record<string, { connected: boolean; toolCount: number }>> {
    if (!this.client) {
      return {
        notion: { connected: false, toolCount: 0 },
        google: { connected: false, toolCount: 0 },
        atlassian: { connected: false, toolCount: 0 },
      };
    }

    return await this.client.getServerStatus();
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    servers: Record<string, { connected: boolean; toolCount: number }>;
    totalTools: number;
    llmAvailable: boolean;
  }> {
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

  /**
   * Reconnect to all MCP servers
   */
  async reconnect(): Promise<void> {
    console.log('🔄 Reconnecting MCP Service...');
    
    if (this.client) {
      try {
        await this.client.reconnect();
        // Reload tools after reconnection
        this.tools = this.client.getTools();
        console.log(`✅ Reconnected with ${this.tools.length} tools`);
      } catch (error) {
        console.error('❌ Failed to reconnect MCP service:', error);
        throw error;
      }
    } else {
      // Full reinitialization if no client
      await this.initialize();
    }
  }

  /**
   * Close all MCP connections
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        console.log('✅ MCP Service connections closed');
      } catch (error) {
        console.error('❌ Error closing MCP Service:', error);
      }
    }
    
    this.isInitialized = false;
    this.client = null;
    this.tools = [];
    this.llm = null;
  }

  /**
   * Restart the MCP service with fresh configuration
   */
  async restart(): Promise<void> {
    console.log('🔄 Restarting MCP Service...');
    await this.close();
    await this.initialize();
  }

  /**
   * Get the MCP client for external use
   */
  getClient(): ReliableMCPClient | null {
    return this.client;
  }

  /**
   * Get the initialized LLM instance
   */
  getLLM(): ChatOpenAI | ChatOllama | null {
    return this.llm;
  }
}

// Create singleton instance
const mcpService = new MCPService();

export default mcpService;
export { MCPService };
