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
  private tools: any[] = [];
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
      const openaiKey = config.get('llm.openai.apiKey') || process.env.OPENAI_API_KEY;
      
      if (openaiKey && openaiKey.trim() !== '') {
        try {
          // Use standard ChatOpenAI import for mcp-use compatibility
          const { ChatOpenAI } = await import('@langchain/openai');
          
          const llm = new ChatOpenAI({
            modelName: 'gpt-4o-mini',
            apiKey: openaiKey,
            temperature: 0.7
          });

          // Create MCP agent using standard mcp-use constructor
          this.agent = new MCPAgent({
            llm: llm as any, // Type workaround for compatibility
            client: this.client,
            maxSteps: 20
          });
          console.log('✅ MCP Agent initialized with OpenAI using standard mcp-use patterns');
        } catch (llmError) {
          console.warn('⚠️ Could not initialize OpenAI LLM:', llmError);
          this.agent = null;
        }
      } else {
        console.log('⚠️ MCP Agent not initialized - OpenAI API key not provided');
        console.log('   Standard tool access will still work through client methods');
        this.agent = null;
      }

      // Get available tools using standard mcp-use client methods
      try {
        if (this.client) {
          // Use standard listTools method from mcp-use (compatible with the library API)
          const availableTools = await (this.client as any).listTools?.() || [];
          this.tools = availableTools || [];
          console.log(`✅ MCP Service initialized successfully with ${this.tools.length} tools`);
          if (this.tools.length > 0) {
            console.log('Available tools:', this.tools.map(tool => tool.name || 'unnamed'));
          }
        } else {
          console.log('⚠️ MCP Client not available, no tools loaded');
          this.tools = [];
        }
      } catch (toolError) {
        console.warn('⚠️ Could not list tools using standard method:', toolError);
        this.tools = [];
      }

      this.isInitialized = true;

    } catch (error) {
      console.error('❌ Failed to initialize MCP Service:', error);
      // Don't throw - allow the service to continue with limited functionality
      this.isInitialized = false;
    }
  }

  /**
   * Get all available MCP tools using standard mcp-use client methods
   */
  async getTools(): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.client) {
      console.warn('⚠️ No MCP client available - cannot list tools');
      return [];
    }

    try {
      // Use standard mcp-use client method to list tools (with type workaround)
      const availableTools = await (this.client as any).listTools?.() || [];
      return availableTools || [];
    } catch (error) {
      console.warn('⚠️ Could not get tools using standard method:', error);
      return this.tools || []; // Return cached tools as fallback
    }
  }

  /**
   * Get tools from a specific MCP server using standard patterns
   */
  async getToolsByServer(serverName: string): Promise<any[]> {
    try {
      // Get all tools and filter by server name if available in tool metadata
      const allTools = await this.getTools();
      const serverTools = allTools.filter(tool => 
        tool.server === serverName || 
        (tool.name && tool.name.toLowerCase().includes(serverName.toLowerCase()))
      );
      
      return serverTools.length > 0 ? serverTools : allTools;
    } catch (error) {
      console.warn(`⚠️ Could not get tools for server ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Execute an MCP tool with parameters using standard mcp-use client methods
   */
  async executeTool(toolName: string, parameters: any = {}): Promise<any> {
    if (!this.client) {
      throw new Error('MCP Client not initialized');
    }

    try {
      // Use standard mcp-use client method to call tools (with type workaround)
      const result = await (this.client as any).callTool?.(toolName, parameters) || { content: 'Tool execution failed' };
      return { 
        tool: toolName, 
        parameters, 
        result: result.content || result 
      };
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Run an agent query across MCP servers using standard mcp-use agent
   */
  async runQuery(query: string, maxSteps: number = 20): Promise<string> {
    if (!this.agent) {
      // Fallback to direct tool execution suggestions if agent not available
      console.warn('⚠️ MCP Agent not available, attempting direct tool usage suggestion');
      const tools = await this.getTools();
      const toolNames = tools.map(tool => tool.name).join(', ');
      return `MCP Agent not initialized. Available tools for direct execution: ${toolNames}. Please ensure OpenAI API key is configured for agent functionality.`;
    }

    try {
      // Use standard mcp-use agent run method (corrected parameters)
      const result = await this.agent.run(query, maxSteps);
      return result;
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
      // Use standard mcp-use agent stream method (corrected parameters)
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
   * Get connection status for all servers
   */
  async getServerStatus(): Promise<Record<string, boolean>> {
    if (!this.client) {
      return { notion: false, calendar: false, jira: false };
    }

    const status: Record<string, boolean> = {};
    const serverNames = ['notion', 'calendar', 'jira'];

    for (const serverName of serverNames) {
      try {
        // Check if the server is configured and has tools available
        const isConfigured = this.serverConfig.mcpServers && this.serverConfig.mcpServers[serverName];
        const serverTools = await this.getToolsByServer(serverName);
        status[serverName] = isConfigured && serverTools.length > 0;
      } catch (error) {
        console.warn(`Server ${serverName} is not available:`, error);
        status[serverName] = false;
      }
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
    this.tools = [];
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
