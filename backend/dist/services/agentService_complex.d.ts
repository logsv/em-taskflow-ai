/**
 * Main function to process user queries using the LangGraph agent
 */
declare function processUserQuery(userInput: string, sessionId?: string | null): Promise<string>;
/**
 * Legacy function for compatibility (formats data the old way)
 */
declare function formatDataForLLM(data: any): Promise<string>;
/**
 * Generates smart priority suggestions based on current workload
 */
declare function generateSmartSuggestions(sessionId?: string | null): Promise<string>;
export { processUserQuery, formatDataForLLM, generateSmartSuggestions };
//# sourceMappingURL=agentService_complex.d.ts.map