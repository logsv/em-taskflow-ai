/**
 * Main function to process user queries with integrated RAG, MCP, and agent capabilities
 */
declare function processQuery(userQuery: string): Promise<string>;
declare const agentService: {
    processQuery: typeof processQuery;
};
export default agentService;
//# sourceMappingURL=agentService.d.ts.map