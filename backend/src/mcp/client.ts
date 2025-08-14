import { z } from 'zod';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { Tool } from '@langchain/core/tools';
import { config, getMcpConfig } from '../config.js';

// MCP Server Configuration Schema
const mcpServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
});

type MCPServerConfig = z.infer<typeof mcpServerConfigSchema>;

/**
 * Reliable MCP Client using LangChain MCP Adapters
 * Handles lifecycle management, reconnection, and provides LangChain-compatible tools
 */
export class ReliableMCPClient {
  private client: MultiServerMCPClient | null = null;
  private tools: Tool[] = [];
  private isInitialized = false;
  private serverConfigs: Record<string, MCPServerConfig> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 5000; // 5 seconds

  /**
   * Initialize the MCP client with server configurations
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing Reliable MCP Client with LangChain adapters...');
      
      const mcpConfig = getMcpConfig();
      this.serverConfigs = this.buildServerConfigs(mcpConfig);
      
      if (Object.keys(this.serverConfigs).length === 0) {
        console.warn('⚠️  No MCP servers configured. Check configuration.');
        return;
      }

      console.log('🔧 Configured MCP servers:', Object.keys(this.serverConfigs));
      
      // Create MultiServerMCPClient with robust configuration
      this.client = new MultiServerMCPClient(this.serverConfigs as any);
      
      // Initialize connections with retry logic
      await this.initializeWithRetry();
      
      // Load tools from connected servers
      await this.loadTools();
      
      this.isInitialized = true;
      console.log(`✅ MCP Client initialized with ${this.tools.length} tools available`);
      
    } catch (error) {
      console.error('❌ Failed to initialize MCP Client:', error);
      throw error;
    }
  }

  /**
   * Initialize connections with retry logic
   */
  private async initializeWithRetry(): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxReconnectAttempts; attempt++) {
      try {
        console.log(`🔄 Connection attempt ${attempt}/${this.maxReconnectAttempts}...`);
        
        if (!this.client) {
          throw new Error('Client not created');
        }
        
        await this.client.initializeConnections();
        console.log('✅ MCP connections initialized successfully');
        this.reconnectAttempts = 0;
        return;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️  Connection attempt ${attempt} failed:`, error);
        
        if (attempt < this.maxReconnectAttempts) {
          console.log(`⏱️  Retrying in ${this.reconnectDelay}ms...`);
          await this.sleep(this.reconnectDelay);
          // Exponential backoff
          this.reconnectDelay *= 1.5;
        }
      }
    }
    
    throw new Error(`Failed to initialize MCP connections after ${this.maxReconnectAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Build server configurations from config
   */
  private buildServerConfigs(mcpConfig: any): Record<string, any> {
    const servers: Record<string, any> = {};
    
    // Notion MCP Server
    if (mcpConfig.notion.enabled && mcpConfig.notion.apiKey) {
      servers.notion = {
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: {
          NOTION_TOKEN: mcpConfig.notion.apiKey,
          NOTION_API_KEY: mcpConfig.notion.apiKey,
          // Add Node.js environment variables for better compatibility
          NODE_TLS_REJECT_UNAUTHORIZED: '0', // Handle self-signed certificates in dev
        },
      };
      console.log('✅ Configured Notion MCP server');
    }
    
    // Atlassian MCP Server (via mcp-remote proxy for reliability)
    if (mcpConfig.jira.enabled) {
      servers.atlassian = {
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://mcp.atlassian.com/v1/sse'],
        env: {
          // Add Jira credentials if available
          ...(mcpConfig.jira.url && { JIRA_URL: mcpConfig.jira.url }),
          ...(mcpConfig.jira.username && { JIRA_USERNAME: mcpConfig.jira.username }),
          ...(mcpConfig.jira.apiToken && { JIRA_API_TOKEN: mcpConfig.jira.apiToken }),
          ...(mcpConfig.jira.projectKey && { JIRA_PROJECT_KEY: mcpConfig.jira.projectKey }),
        },
      };
      console.log('✅ Configured Atlassian MCP server via mcp-remote proxy');
    }
    
    // Google Calendar MCP Server
    if (mcpConfig.google.enabled && mcpConfig.google.oauthCredentials) {
      servers.google = {
        command: 'npx',
        args: ['-y', '@cocal/google-calendar-mcp'],
        env: {
          GOOGLE_OAUTH_CREDENTIALS: mcpConfig.google.oauthCredentials,
          GOOGLE_CALENDAR_ID: mcpConfig.google.calendarId,
        },
      };
      console.log('✅ Configured Google Calendar MCP server');
    }
    
    return servers;
  }

  /**
   * Load tools from connected MCP servers
   */
  private async loadTools(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    
    try {
      // Get LangChain-compatible tools from the adapter (it returns a Promise)
      this.tools = (await this.client.getTools()) as unknown as Tool[];
      console.log(`📋 Loaded ${this.tools.length} MCP tools:`, this.tools.map(t => t.name));
      
      // Log tool schemas for debugging
      if (this.tools.length > 0) {
        console.log('🔍 Available tool schemas:');
        this.tools.forEach(tool => {
          console.log(`  - ${tool.name}: ${tool.description}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to load MCP tools:', error);
      this.tools = [];
    }
  }

  /**
   * Get all available tools as LangChain Tools
   */
  getTools(): Tool[] {
    return this.tools;
  }

  /**
   * Get tools filtered by server name
   */
  getToolsByServer(serverName: string): Tool[] {
    // Tools from MultiServerMCPClient are prefixed with server name
    return this.tools.filter(tool => tool.name.startsWith(`${serverName}_`));
  }

  /**
   * Execute a tool by name with parameters
   */
  async executeTool(toolName: string, parameters: any): Promise<any> {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found. Available tools: ${this.tools.map(t => t.name).join(', ')}`);
    }
    
    try {
      console.log(`🔧 Executing tool: ${toolName} with parameters:`, parameters);
      const result = await tool.invoke(parameters);
      console.log(`✅ Tool execution completed: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`❌ Tool execution failed: ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Get server connection status
   */
  async getServerStatus(): Promise<Record<string, { connected: boolean; toolCount: number }>> {
    const status: Record<string, { connected: boolean; toolCount: number }> = {};
    
    for (const serverName of Object.keys(this.serverConfigs)) {
      const serverTools = this.getToolsByServer(serverName);
      status[serverName] = {
        connected: serverTools.length > 0,
        toolCount: serverTools.length,
      };
    }
    
    return status;
  }

  /**
   * Reconnect to all servers
   */
  async reconnect(): Promise<void> {
    console.log('🔄 Reconnecting MCP client...');
    
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn('Warning during connection cleanup:', error);
      }
    }
    
    // Reinitialize
    await this.initialize();
  }

  /**
   * Health check for the MCP client
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    servers: Record<string, { connected: boolean; toolCount: number }>;
    totalTools: number;
  }> {
    const servers = await this.getServerStatus();
    const totalTools = this.tools.length;
    const connectedServers = Object.values(servers).filter(s => s.connected).length;
    
    return {
      healthy: this.isInitialized && totalTools > 0,
      servers,
      totalTools,
    };
  }

  /**
   * Check if client is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null && this.tools.length > 0;
  }

  /**
   * Get the underlying MultiServerMCPClient for advanced use cases
   */
  getClient(): MultiServerMCPClient | null {
    return this.client;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        // Use the correct close method from MultiServerMCPClient
        await this.client.close();
        console.log('✅ MCP connections closed');
      } catch (error) {
        console.error('❌ Error closing MCP connections:', error);
      }
    }
    
    this.client = null;
    this.tools = [];
    this.isInitialized = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Utility method for sleeping
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance for the application
let mcpClientInstance: ReliableMCPClient | null = null;

/**
 * Get or create the singleton MCP client instance
 */
export async function getMCPClient(): Promise<ReliableMCPClient> {
  if (!mcpClientInstance) {
    mcpClientInstance = new ReliableMCPClient();
    await mcpClientInstance.initialize();
  }
  
  if (!mcpClientInstance.isReady()) {
    // Attempt to reconnect if not ready
    await mcpClientInstance.reconnect();
  }
  
  return mcpClientInstance;
}

/**
 * Load MCP tools for use in LangGraph agents
 */
export async function loadMcpTools(): Promise<{ tools: Tool[]; client: ReliableMCPClient }> {
  const client = await getMCPClient();
  const tools = client.getTools();
  
  console.log(`🛠️  Loaded ${tools.length} MCP tools for LangGraph integration`);
  
  return { tools, client };
}

/**
 * Close the singleton MCP client
 */
export async function closeMCPClient(): Promise<void> {
  if (mcpClientInstance) {
    await mcpClientInstance.close();
    mcpClientInstance = null;
  }
}

// Export the client class and utility functions
export default ReliableMCPClient;