interface AgentResponse {
    response: string;
    intent: string;
    dataUsed: string[];
}
/**
 * Main agent processing function
 */
declare function processQuery(userQuery: string): Promise<AgentResponse>;
declare const agentService: {
    processQuery: typeof processQuery;
};
export default agentService;
//# sourceMappingURL=agentService.d.ts.map