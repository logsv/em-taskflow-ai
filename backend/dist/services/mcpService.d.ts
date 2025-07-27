/**
 * MCP Service using LangChain MCP Adapters
 * Manages connections to multiple MCP servers (Notion, Jira/Atlassian, Google Calendar)
 */
declare class MCPService {
    private client;
    private tools;
    private isInitialized;
    /**
     * Initialize the MCP client with all server configurations
     */
    initialize(): Promise<void>;
    /**
     * Get all available MCP tools
     */
    getTools(): Promise<any[]>;
    /**
     * Get tools from a specific MCP server
     */
    getToolsByServer(serverName: string): Promise<any[]>;
    /**
     * Check if MCP service is ready
     */
    isReady(): boolean;
    /**
     * Get connection status for all servers
     */
    getServerStatus(): Promise<Record<string, boolean>>;
    /**
     * Close all MCP connections
     */
    close(): Promise<void>;
    /**
     * Restart the MCP service (useful for reconnecting)
     */
    restart(): Promise<void>;
}
declare const mcpService: MCPService;
export default mcpService;
export { MCPService };
//# sourceMappingURL=mcpService.d.ts.map