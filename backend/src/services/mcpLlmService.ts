// Temporary compatibility wrapper for MCP router
import getMCPRouter from './newLlmRouter.js';

/**
 * Compatibility wrapper for the old LLM services
 * Routes all requests through MCP agents
 */
class MCPLlmService {
  private initialized = false;

  async initialize(): Promise<void> {
    // Initialize MCP router
    await getMCPRouter();
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async complete(prompt: string, options: any = {}): Promise<string> {
    const mcpRouter = await getMCPRouter();
    return await mcpRouter.executeMCPQuery(prompt, options.maxTokens ? Math.min(options.maxTokens / 100, 20) : 20);
  }

  async completeWithMetadata(prompt: string, options: any = {}): Promise<any> {
    const result = await this.complete(prompt, options);
    return {
      response: result,
      metadata: {
        provider: 'mcp-router',
        model: 'gpt-oss-latest-mcp',
        tokens: { input: 0, output: 0, total: 0 }
      }
    };
  }

  async healthCheck(): Promise<any> {
    const mcpRouter = await getMCPRouter();
    return await mcpRouter.healthCheck();
  }

  getProviderStatus(): any {
    return { mcp: true };
  }

  getAvailableModels(): string[] {
    return ['gpt-4o-mini-mcp', 'llama3.1-latest-mcp'];
  }

  getAvailableProviders(): string[] {
    return ['openai-mcp', 'ollama-mcp'];
  }
}

// Create singleton instance
const mcpLlmService = new MCPLlmService();

export default mcpLlmService;