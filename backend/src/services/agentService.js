import { ensureLLMReady, getLLMStatus } from "../llm/index.js";
import { executeAgentQuery, checkAgentReadiness, getAgentTools } from "../agent/graph.js";
import { getRuntimeConfig } from "../config.js";

export class LangGraphAgentService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    const readiness = await checkAgentReadiness();
    if (!readiness.ready) {
      throw new Error(`Agent not ready: ${readiness.error || "unknown error"}`);
    }

    this.initialized = true;
  }

  async processQuery(userQuery, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    await this.ensureLlmReadyForQuery();

    const startTime = Date.now();
    
    const result = await executeAgentQuery(userQuery, options);

    const executionTime = Date.now() - startTime;
    return {
      threadId: options.threadId || null,
      ...result,
      meta: {
        executionTime,
      },
    };
  }

  async getStatus() {
    const runtimeMode = getRuntimeConfig().mode;
    const llmStatus = await getLLMStatus().catch(() => ({ initialized: false }));
    const readiness =
      runtimeMode === "full"
        ? await checkAgentReadiness().catch(() => ({ ready: false, toolCount: 0 }))
        : { ready: false, toolCount: 0 };
    return {
      ready: this.initialized,
      mcpReady: readiness.ready,
      toolCount: readiness.toolCount,
      ragEnabled: true, // RAG is now part of the agent
      llmReady: !!llmStatus.initialized,
      runtimeMode,
    };
  }

  async getAvailableTools() {
    const { toolInfo } = await getAgentTools();
    return toolInfo;
  }

  async ensureLlmReadyForQuery() {
    try {
      await ensureLLMReady();
    } catch (error) {
      const message = error?.message || "LLM initialization failed";
      throw new Error(`LLM unavailable: ${message}`);
    }
  }
}

const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;
