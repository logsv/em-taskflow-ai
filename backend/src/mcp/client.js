import { z } from 'zod';
import { MCPClient, mcpToLangChainTools } from '@langchain/mcp';
import { getMcpConfig } from '../config.js';

// MCP Server Configuration Schema
const mcpServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
});

export class ReliableMCPClient {
  constructor() {
    this.clients = {};
    this.tools = [];
    this.toolsByServer = {};
    this.isInitialized = false;
    this.serverConfigs = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 5000; // 5 seconds
  }

  /**
   * Initialize the MCP client with server configurations
   */
  async initialize() {
    try {
      console.log('🔧 Initializing Reliable MCP Client with LangChain MCP...');
      
      const mcpConfig = getMcpConfig();
      this.serverConfigs = this.buildServerConfigs(mcpConfig);
      
      if (Object.keys(this.serverConfigs).length === 0) {
        console.warn('⚠️  No MCP servers configured. Check configuration.');
        return;
      }

      console.log('🔧 Configured MCP servers:', Object.keys(this.serverConfigs));
      
      await this.initializeWithRetry();
      
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
  async initializeWithRetry() {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxReconnectAttempts; attempt++) {
      try {
        console.log(`🔄 Connection attempt ${attempt}/${this.maxReconnectAttempts}...`);
        
        await this.connectAllServers();
        console.log('✅ MCP connections initialized successfully');
        this.reconnectAttempts = 0;
        return;
        
      } catch (error) {
        lastError = error;
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

  buildServerConfigs(mcpConfig) {
    const servers = {};
    
    if (mcpConfig.notion.enabled && mcpConfig.notion.apiKey) {
      servers.notion = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: {
          NOTION_TOKEN: mcpConfig.notion.apiKey,
          NOTION_API_KEY: mcpConfig.notion.apiKey,
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
        },
      };
      console.log('✅ Configured Notion MCP server');
    }
    
    if (mcpConfig.jira.enabled) {
      servers.atlassian = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://mcp.atlassian.com/v1/sse'],
        env: {
          ...(mcpConfig.jira.url && { JIRA_URL: mcpConfig.jira.url }),
          ...(mcpConfig.jira.username && { JIRA_USERNAME: mcpConfig.jira.username }),
          ...(mcpConfig.jira.apiToken && { JIRA_API_TOKEN: mcpConfig.jira.apiToken }),
          ...(mcpConfig.jira.projectKey && { JIRA_PROJECT_KEY: mcpConfig.jira.projectKey }),
        },
      };
      console.log('✅ Configured Atlassian MCP server via mcp-remote proxy');
    }
    
    if (mcpConfig.google.enabled && mcpConfig.google.oauthCredentials) {
      servers.google = {
        type: 'stdio',
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

  async connectAllServers() {
    await this.closeAllClients();

    const serverNames = Object.keys(this.serverConfigs || {});
    if (serverNames.length === 0) {
      throw new Error('No MCP servers configured');
    }

    this.clients = {};

    const errors = [];

    for (const serverName of serverNames) {
      const transportConfig = this.serverConfigs[serverName];
      try {
        const client = new MCPClient({
          name: serverName,
          transport: transportConfig,
        });
        await client.connect();
        this.clients[serverName] = client;
        console.log(`✅ Connected to MCP server: ${serverName}`);
      } catch (error) {
        console.warn(`⚠️  Failed to connect to MCP server ${serverName}:`, error);
        errors.push(error);
      }
    }

    if (Object.keys(this.clients).length === 0) {
      throw new Error(
        `Failed to connect to any MCP servers: ${errors.map((e) => e?.message || 'Unknown error').join('; ')}`
      );
    }
  }

  async loadTools() {
    try {
      const serverNames = Object.keys(this.clients || {});
      this.tools = [];
      this.toolsByServer = {};

      for (const serverName of serverNames) {
        const client = this.clients[serverName];
        try {
          const serverTools = await mcpToLangChainTools(client);
          const namespacedTools = serverTools.map((tool) => {
            const originalName =
              tool.name || (tool.lc_kwargs && typeof tool.lc_kwargs === 'object' && tool.lc_kwargs.name) || 'tool';
            const prefixedName = `${serverName}_${originalName}`;
            tool.name = prefixedName;
            if (tool.lc_kwargs && typeof tool.lc_kwargs === 'object') {
              tool.lc_kwargs.name = prefixedName;
            }
            return tool;
          });

          this.toolsByServer[serverName] = namespacedTools;
          this.tools.push(...namespacedTools);
        } catch (error) {
          console.warn(`⚠️  Failed to load tools for MCP server ${serverName}:`, error);
        }
      }

      console.log(`📋 Loaded ${this.tools.length} MCP tools:`, this.tools.map(t => t.name));
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
  getTools() {
    return this.tools;
  }

  /**
   * Get tools filtered by server name
   */
  getToolsByServer(serverName) {
    return this.toolsByServer[serverName] || [];
  }

  getAllToolsByServer() {
    return { ...this.toolsByServer };
  }

  /**
   * Execute a tool by name with parameters
   */
  async executeTool(toolName, parameters) {
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
  async getServerStatus() {
    const status = {};
    
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
  async reconnect() {
    console.log('🔄 Reconnecting MCP client...');
    await this.initialize();
  }

  /**
   * Health check for the MCP client
   */
  async healthCheck() {
    const servers = await this.getServerStatus();
    const totalTools = this.tools.length;
    
    return {
      healthy: this.isInitialized && totalTools > 0,
      servers,
      totalTools,
    };
  }

  /**
   * Check if client is ready
   */
  isReady() {
    return this.isInitialized && Object.keys(this.clients || {}).length > 0 && this.tools.length > 0;
  }

  /**
   * Get the underlying MCP clients for advanced use cases
   */
  getClient() {
    return this.clients;
  }

  /**
   * Close all connections
   */
  async close() {
    await this.closeAllClients();
    
    this.clients = {};
    this.tools = [];
    this.toolsByServer = {};
    this.isInitialized = false;
    this.reconnectAttempts = 0;
  }

  async closeAllClients() {
    const clientEntries = Object.entries(this.clients || {});
    for (const [, client] of clientEntries) {
      if (!client) continue;
      try {
        if (typeof client.close === 'function') {
          await client.close();
        }
      } catch (error) {
        console.error('❌ Error closing MCP client:', error);
      }
    }
  }

  /**
   * Utility method for sleeping
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance for the application
let mcpClientInstance = null;

/**
 * Get or create the singleton MCP client instance
 */
export async function getMCPClient() {
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
export async function loadMcpTools() {
  const client = await getMCPClient();
  const tools = client.getTools();
  const toolsByServer = client.getAllToolsByServer
    ? client.getAllToolsByServer()
    : {};
  
  console.log(`🛠️  Loaded ${tools.length} MCP tools for LangGraph integration`);
  
  return { tools, client, toolsByServer };
}

/**
 * Close the singleton MCP client
 */
export async function closeMCPClient() {
  if (mcpClientInstance) {
    await mcpClientInstance.close();
    mcpClientInstance = null;
  }
}

// Export the client class and utility functions
export default ReliableMCPClient;
