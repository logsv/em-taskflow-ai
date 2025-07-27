import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MCP Service using LangChain MCP Adapters
 * Manages connections to multiple MCP servers (Notion, Jira/Atlassian, Google Calendar)
 */
class MCPService {
  private client: MultiServerMCPClient | null = null;
  private tools: any[] = [];
  private isInitialized = false;

  /**
   * Initialize the MCP client with all server configurations
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing MCP Service with LangChain adapters...');

      this.client = new MultiServerMCPClient({
        // Global tool configuration options
        throwOnLoadError: false, // Don't throw if a server fails to load
        prefixToolNameWithServerName: true, // Prefix tools with server name for clarity
        useStandardContentBlocks: true, // Use standardized content format
        
        // MCP Server configurations
        mcpServers: {
          // Official Notion MCP Server
          notion: {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@notionhq/notion-mcp-server'],
            env: {
              NOTION_API_KEY: process.env.NOTION_API_KEY || '',
              NOTION_VERSION: '2022-06-28'
            },
            restart: {
              enabled: true,
              maxAttempts: 3,
              delayMs: 1000,
            }
          },

          // Google Calendar MCP Server
          calendar: {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@cocal/google-calendar-mcp'],
            env: {
              GOOGLE_OAUTH_CREDENTIALS: process.env.GOOGLE_OAUTH_CREDENTIALS || '',
              GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || 'primary'
            },
            restart: {
              enabled: true,
              maxAttempts: 3,
              delayMs: 1000,
            }
          },

          // Jira Context MCP Server (locally built)
          // Using the cloned and built repository from rahulthedevil/Jira-Context-MCP
          jira: {
            transport: 'stdio',
            command: 'node',
            args: ['./mcp-servers/jira-context-mcp/dist/index.js'],
            env: {
              JIRA_URL: process.env.JIRA_URL || '',
              JIRA_USERNAME: process.env.JIRA_USERNAME || '',
              JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || '',
              JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY || ''
            },
            restart: {
              enabled: true,
              maxAttempts: 3,
              delayMs: 1000,
            }
          }
        }
      });

      // Load all available tools from MCP servers
      this.tools = await this.client.getTools();
      this.isInitialized = true;

      console.log(`MCP Service initialized successfully with ${this.tools.length} tools`);
      console.log('Available tools:', this.tools.map(tool => tool.name));

    } catch (error) {
      console.error('Failed to initialize MCP Service:', error);
      // Don't throw - allow the service to continue with limited functionality
      this.isInitialized = false;
    }
  }

  /**
   * Get all available MCP tools
   */
  async getTools(): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.tools;
  }

  /**
   * Get tools from a specific MCP server
   */
  async getToolsByServer(serverName: string): Promise<any[]> {
    const allTools = await this.getTools();
    return allTools.filter(tool => tool.name.startsWith(`${serverName}_`));
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
        // Try to get tools from each server to check connectivity
        const serverTools = await this.getToolsByServer(serverName);
        status[serverName] = serverTools.length > 0;
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
        await this.client.close();
        console.log('MCP Service connections closed');
      } catch (error) {
        console.error('Error closing MCP Service:', error);
      }
    }
    this.isInitialized = false;
    this.client = null;
    this.tools = [];
  }

  /**
   * Restart the MCP service (useful for reconnecting)
   */
  async restart(): Promise<void> {
    await this.close();
    await this.initialize();
  }
}

// Create singleton instance
const mcpService = new MCPService();

export default mcpService;
export { MCPService };
