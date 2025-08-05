import { MCPClient, MCPAgent } from 'mcp-use';
import config from '../config/config.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MCP Service using mcp-use
 * Manages connections to multiple MCP servers (Notion, Jira/Atlassian, Google Calendar)
 */
class MCPService {
  private client: MCPClient | null = null;
  private agent: MCPAgent | null = null;
  private tools: any[] = [];
  private isInitialized = false;
  private serverConfig: any = {};

  /**
   * Initialize the MCP client with all server configurations
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing MCP Service with mcp-use...');

      // Build MCP server configurations based on enabled flags
      const mcpServers: any = {};

      // Add Notion server if enabled
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

      // Add Google Calendar server if enabled
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

      // Add Jira server if enabled
      if (config.get('mcp.jira.enabled') && config.get('mcp.jira.url') && config.get('mcp.jira.apiToken')) {
        mcpServers.jira = {
          command: 'node',
          args: ['./mcp-servers/jira-context-mcp/dist/index.js'],
          env: {
            JIRA_URL: config.get('mcp.jira.url'),
            JIRA_USERNAME: config.get('mcp.jira.username'),
            JIRA_API_TOKEN: config.get('mcp.jira.apiToken'),
            JIRA_PROJECT_KEY: config.get('mcp.jira.projectKey')
          }
        };
      }

      console.log('🔧 Enabled MCP servers:', Object.keys(mcpServers));

      // Store server config and create client
      this.serverConfig = { mcpServers };
      this.client = MCPClient.fromDict(this.serverConfig);

      // Initialize LLM for the agent (only if OpenAI key is available)
      const openaiKey = config.get('llm.openai.apiKey') || process.env.OPENAI_API_KEY;
      
      if (openaiKey && openaiKey.trim() !== '') {
        try {
          // Use dynamic import to get ChatOpenAI from mcp-use's bundled LangChain
          const { ChatOpenAI } = await import('@langchain/openai');
          
          const llm = new ChatOpenAI({
            modelName: 'gpt-4o',
            apiKey: openaiKey,
            temperature: 0.7
          } as any); // Use 'as any' to bypass type checking issues

          // Create MCP agent
          this.agent = new MCPAgent({
            llm: llm as any,
            client: this.client,
            maxSteps: 20
          });
          console.log('✅ MCP Agent initialized with OpenAI');
        } catch (llmError) {
          console.warn('⚠️ Could not initialize OpenAI LLM:', llmError);
          this.agent = null;
        }
      } else {
        console.log('⚠️ MCP Agent not initialized - OpenAI API key not provided');
        console.log('   Direct tool execution will still work, but agent queries will require OpenAI');
        this.agent = null;
      }

      // Get available tools info through agent query
      try {
        if (this.agent) {
          const toolsInfo = await this.agent.run('What tools are available? List all available tools and their descriptions.');
          console.log(`✅ MCP Service initialized successfully`);
          console.log('Available tools info:', toolsInfo);
          // Store tools as empty array since we'll query dynamically
          this.tools = [];
        } else {
          console.log('✅ MCP Service initialized (client only - no agent)');
          this.tools = [];
        }
      } catch (toolError) {
        console.warn('⚠️ Could not get tools info initially:', toolError);
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
   * Get all available MCP tools (returns info about tools via agent query)
   */
  async getTools(): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.agent) {
      console.warn('⚠️ No agent available - cannot list tools');
      return [];
    }

    try {
      // Query for available tools through the agent
      const toolsInfo = await this.agent.run('List all available tools with their names and descriptions in JSON format.');
      
      // Try to parse JSON response or return text info
      try {
        const parsedTools = JSON.parse(toolsInfo);
        return Array.isArray(parsedTools) ? parsedTools : [{ info: toolsInfo }];
      } catch {
        // If not JSON, return as text info
        return [{ info: toolsInfo }];
      }
    } catch (error) {
      console.warn('⚠️ Could not get tools:', error);
      return []; // Return empty array
    }
  }

  /**
   * Get tools from a specific MCP server
   */
  async getToolsByServer(serverName: string): Promise<any[]> {
    if (!this.agent) {
      return [];
    }

    try {
      const toolsInfo = await this.agent.run(`List all available tools from the ${serverName} server with their names and descriptions.`);
      return [{ server: serverName, info: toolsInfo }];
    } catch (error) {
      console.warn(`⚠️ Could not get tools for server ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Execute an MCP tool with parameters (via agent query)
   */
  async executeTool(toolName: string, parameters: any = {}): Promise<any> {
    if (!this.agent) {
      throw new Error('MCP Agent not initialized');
    }

    try {
      // Construct a query to execute the specific tool
      const paramString = Object.keys(parameters).length > 0 
        ? ` with parameters: ${JSON.stringify(parameters)}`
        : '';
      
      const query = `Execute the ${toolName} tool${paramString}`;
      const result = await this.agent.run(query);
      return { tool: toolName, parameters, result };
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Run an agent query across MCP servers
   */
  async runQuery(query: string, maxSteps: number = 20): Promise<string> {
    if (!this.agent) {
      throw new Error('MCP Agent not initialized');
    }

    try {
      const result = await this.agent.run(query, maxSteps);
      return result;
    } catch (error) {
      console.error('Error running MCP agent query:', error);
      throw error;
    }
  }

  /**
   * Stream an agent query for real-time responses
   */
  async *streamQuery(query: string, maxSteps: number = 20): AsyncGenerator<any, void, unknown> {
    if (!this.agent) {
      throw new Error('MCP Agent not initialized');
    }

    try {
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
   * Close all MCP connections
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        // mcp-use uses closeAllSessions method
        if (typeof (this.client as any).closeAllSessions === 'function') {
          await (this.client as any).closeAllSessions();
        }
        console.log('✅ MCP Service connections closed');
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
    await this.initialize();
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
