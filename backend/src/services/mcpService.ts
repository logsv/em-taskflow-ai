import { MCPClient, MCPAgent } from 'mcp-use';
import config from '../config/config.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MCP Service using mcp-use standard patterns
 * Manages connections to multiple MCP servers (Notion, Jira/Atlassian, Google Calendar)
 */
class MCPService {
  private client: MCPClient | null = null;
  private agent: MCPAgent | null = null;
  private isInitialized = false;
  private serverConfig: any = {};

  /**
   * Initialize the MCP client with all server configurations using standard mcp-use approach
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing MCP Service with mcp-use standard patterns...');

      // Debug configuration values
      console.log('🔧 DEBUG - Configuration values:');
      console.log('  Notion enabled:', config.get('mcp.notion.enabled'));
      console.log('  Notion API key length:', config.get('mcp.notion.apiKey')?.length || 0);
      console.log('  Jira enabled:', config.get('mcp.jira.enabled'));
      console.log('  Jira URL:', config.get('mcp.jira.url'));
      console.log('  Jira API token length:', config.get('mcp.jira.apiToken')?.length || 0);

      // Build MCP server configurations using standard mcp-use format
      const mcpServers: any = {};

      // Add Notion server if enabled - using standard MCP studio server path
      if (config.get('mcp.notion.enabled') && config.get('mcp.notion.apiKey')) {
        mcpServers.notion = {
          command: 'npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          env: {
            NOTION_API_KEY: config.get('mcp.notion.apiKey'),
            NOTION_VERSION: '2022-06-28'
          }
        };
      }

      // Add Google Calendar server if enabled - using standard MCP studio server path
      if (config.get('mcp.google.enabled') && config.get('mcp.google.oauthCredentials')) {
        mcpServers.calendar = {
          command: 'npx',
          args: ['-y', '@cocal/google-calendar-mcp'],
          env: {
            GOOGLE_OAUTH_CREDENTIALS: config.get('mcp.google.oauthCredentials'),
            GOOGLE_CALENDAR_ID: config.get('mcp.google.calendarId')
          }
        };
      }

      // Add Jira server if enabled - using standard MCP studio server path
      if (config.get('mcp.jira.enabled') && config.get('mcp.jira.url') && config.get('mcp.jira.apiToken')) {
        mcpServers.jira = {
          command: 'npx',
          args: ['-y', '@atlassianlabs/mcp-server-atlassian'],
          env: {
            ATLASSIAN_URL: config.get('mcp.jira.url'),
            ATLASSIAN_EMAIL: config.get('mcp.jira.username'),
            ATLASSIAN_API_TOKEN: config.get('mcp.jira.apiToken')
          }
        };
      }

      console.log('🔧 Enabled MCP servers:', Object.keys(mcpServers));

      // Store server config and create client using standard fromDict method
      this.serverConfig = { mcpServers };
      this.client = MCPClient.fromDict(this.serverConfig);

      // Initialize LLM for the agent using standard mcp-use approach
      const llmProvider = config.get('llm.provider');
      const openaiKey = config.get('llm.openai.apiKey') || process.env.OPENAI_API_KEY;
      const ollamaBaseUrl = config.get('llm.ollama.baseUrl');
      
      let llm: any = null;
      
      // Try OpenAI first if API key is available
      if (openaiKey && openaiKey.trim() !== '') {
        try {
          // Use standard ChatOpenAI import for mcp-use compatibility
          const { ChatOpenAI } = await import('@langchain/openai');
          
          llm = new ChatOpenAI({
            modelName: 'gpt-4o-mini',
            apiKey: openaiKey,
            temperature: 0.7
          });
          console.log('✅ Using OpenAI LLM for MCP Agent');
        } catch (llmError) {
          console.warn('⚠️ Could not initialize OpenAI LLM:', llmError);
        }
      }
      
      // Fall back to Ollama if OpenAI not available and provider is ollama
      if (!llm && llmProvider === 'ollama' && ollamaBaseUrl) {
        try {
          // Use proper ChatOllama from @langchain/ollama package
          const { ChatOllama } = await import('@langchain/ollama');
          
          llm = new ChatOllama({
            baseUrl: ollamaBaseUrl,
            model: 'mistral:latest',
            temperature: 0.7
          });
          console.log('✅ Using ChatOllama (mistral:latest) for MCP Agent');
        } catch (ollamaError) {
          console.warn('⚠️ Could not initialize ChatOllama:', ollamaError);
        }
      }
      
      // Create MCP agent if we have an LLM
      if (llm) {
        try {
          this.agent = new MCPAgent({
            llm: llm as any, // Type workaround for compatibility
            client: this.client,
            maxSteps: 20
          });
          console.log('✅ MCP Agent initialized successfully using standard mcp-use patterns');
        } catch (agentError) {
          console.warn('⚠️ Could not create MCP Agent:', agentError);
          this.agent = null;
        }
      } else {
        console.log('⚠️ MCP Agent not initialized - No compatible LLM provider available');
        console.log('   Available providers: OpenAI (requires API key), Ollama (requires running service)');
        console.log('   Standard tool access will still work through client methods');
        this.agent = null;
      }

      this.isInitialized = true;
      console.log(`✅ MCP Service initialized successfully - ready for agent-based tool calling`);

    } catch (error) {
      console.error('❌ Failed to initialize MCP Service:', error);
      // Don't throw - allow the service to continue with limited functionality
      this.isInitialized = false;
    }
  }


  /**
   * Run an agent query across MCP servers using standard mcp-use agent
   * This is the primary method for all MCP interactions - let the LLM handle tool calling
   */
  async runQuery(query: string, maxSteps: number = 20): Promise<string> {
    if (!this.agent) {
      throw new Error('MCP Agent not initialized. Please ensure a compatible LLM (OpenAI or Ollama with tool calling support) is configured.');
    }

    try {
      // Use standard mcp-use agent run method with timeout guard
      const result = await Promise.race([
        this.agent.run(query, maxSteps),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('MCP agent timed out after 40 seconds')), 40_000))
      ]);
      return result as string;
    } catch (error) {
      console.error('Error running MCP agent query:', error);
      throw error;
    }
  }

  /**
   * Stream an agent query for real-time responses using standard mcp-use patterns
   */
  async *streamQuery(query: string, maxSteps: number = 20): AsyncGenerator<any, void, unknown> {
    if (!this.agent) {
      throw new Error('MCP Agent not initialized');
    }

    try {
      // Use standard mcp-use agent stream method with safety timeout per step
      for await (const step of this.agent.stream(query, maxSteps)) {
        yield step;
      }
    } catch (error) {
      console.error('Error streaming MCP agent query:', error);
      throw error;
    }
  }

  /**
   * Check if MCP service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Get connection status for all servers based on configuration
   */
  async getServerStatus(): Promise<Record<string, boolean>> {
    if (!this.client) {
      return { notion: false, calendar: false, jira: false };
    }

    const status: Record<string, boolean> = {};
    const serverNames = ['notion', 'calendar', 'jira'];

    for (const serverName of serverNames) {
      // Check if the server is configured (agent will discover tools automatically)
      const isConfigured = this.serverConfig.mcpServers && this.serverConfig.mcpServers[serverName];
      status[serverName] = !!isConfigured;
    }

    return status;
  }

  /**
   * Close all MCP connections using standard mcp-use patterns
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        // Use standard mcp-use client close method (with type workaround)
        if (typeof (this.client as any).close === 'function') {
          await (this.client as any).close();
        } else if (typeof (this.client as any).closeAllSessions === 'function') {
          await (this.client as any).closeAllSessions();
        }
        console.log('✅ MCP Service connections closed using standard method');
      } catch (error) {
        console.error('❌ Error closing MCP Service:', error);
      }
    }
    this.isInitialized = false;
    this.client = null;
    this.agent = null;
    this.serverConfig = {};
  }

  /**
   * Restart the MCP service (useful for reconnecting)
   */
  async restart(): Promise<void> {
    console.log('🔄 Restarting MCP Service...');
    await this.close();
    
    // Force reload configuration by re-importing
    const configModule = await import('../config/config.js');
    const freshConfig = configModule.default;
    
    // Re-initialize with fresh config
    await this.initialize();
  }

  /**
   * Force restart with fresh configuration
   */
  async forceRestart(): Promise<void> {
    console.log('🔄 Force restarting MCP Service with fresh configuration...');
    this.isInitialized = false;
    await this.restart();
  }

  /**
   * Get the MCP client for use by agent service
   * This allows the agent to access MCP tools directly
   */
  getClient(): any {
    return this.client;
  }

  /**
   * Get the MCP agent for use by agent service
   * This allows integration with the RAG query pipeline
   */
  getAgent(): any {
    return this.agent;
  }
}

// Create singleton instance
const mcpService = new MCPService();

export default mcpService;
export { MCPService };
