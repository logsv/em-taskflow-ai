import ragService from "../rag/index.js";
import { getChatModel } from "../llm/index.js";
import { executeAgentQuery, checkAgentReadiness, getAgentTools } from "../agent/graph.js";
import { getRuntimeConfig } from "../config.js";

const POLICY_ORDER = ["combined", "rag", "mcp", "llm"];

export class LangGraphAgentService {
  constructor() {
    this.initialized = false;
    this.tools = [];
    this.ragEnabled = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    const runtime = getRuntimeConfig();
    const ragStatus = await ragService.getStatus().catch(() => ({ ready: false }));
    this.ragEnabled = !!ragStatus.ready;

    if (runtime.mode === "full") {
      const { tools } = await getAgentTools();
      this.tools = tools;
      const readiness = await checkAgentReadiness();
      if (!readiness.ready) {
        throw new Error(`Agent not ready: ${readiness.error || "unknown error"}`);
      }
    } else {
      this.tools = [];
    }

    this.initialized = true;
  }

  async processQuery(userQuery, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const runtime = getRuntimeConfig();
    const ragMode = options.ragMode === "advanced" ? "advanced" : "baseline";
    const decision = {
      policyOrder: runtime.mode === "rag_only" ? ["rag", "llm"] : POLICY_ORDER,
      selectedPath: "llm",
      ragHit: false,
      mcpReady: runtime.mode === "full" && this.tools.length > 0,
      ragMode,
      toolsUsed: [],
      reasons: [],
    };

    let ragResult = null;
    if (this.ragEnabled && options.includeRag !== false) {
      ragResult = await this.tryRag(userQuery, ragMode);
      if (ragResult && Array.isArray(ragResult.sources) && ragResult.sources.length > 0) {
        decision.ragHit = true;
      } else {
        decision.reasons.push("rag_no_hits");
      }
    } else {
      decision.reasons.push("rag_disabled_or_skipped");
    }

    let result;
    if (runtime.mode === "rag_only") {
      if (decision.ragHit && ragResult) {
        decision.selectedPath = "rag+llm";
        result = this.formatResultFromRag(ragResult);
      } else {
        decision.selectedPath = "llm-only";
        result = await this.runLlmExecutor(userQuery);
      }
    } else {
      result = await this.runFullPolicy(userQuery, ragResult, decision);
    }

    const executionTime = Date.now() - startTime;
    return {
      threadId: options.threadId || null,
      answer: result.answer,
      sources: result.sources || [],
      meta: {
        executionTime,
        decision,
      },
    };
  }

  async runFullPolicy(userQuery, ragResult, decision) {
    const mcpReady = decision.mcpReady;
    const ragHit = decision.ragHit;

    if (ragHit && mcpReady) {
      decision.selectedPath = "rag+mcp+llm";
      const combined = await this.runCombinedExecutor(userQuery, ragResult);
      decision.toolsUsed = combined.toolsUsed;
      if (combined.answer) {
        return combined;
      }
      decision.reasons.push("combined_failed");
    }

    if (ragHit) {
      decision.selectedPath = "rag+llm";
      return this.formatResultFromRag(ragResult);
    }

    if (mcpReady) {
      decision.selectedPath = "mcp+llm";
      const mcp = await this.runMcpExecutor(userQuery);
      decision.toolsUsed = mcp.toolsUsed;
      if (mcp.answer) {
        return mcp;
      }
      decision.reasons.push("mcp_failed");
    }

    decision.selectedPath = "llm-only";
    return this.runLlmExecutor(userQuery);
  }

  async runCombinedExecutor(query, ragResult) {
    const ragContext = ragResult?.sources
      ?.slice(0, 4)
      .map((doc, idx) => `RAG Doc ${idx + 1}: ${doc.pageContent}`)
      .join("\n\n");

    const enriched = ragContext
      ? `Use this retrieved document context when relevant:\n\n${ragContext}\n\nUser query:\n${query}`
      : query;

    const result = await executeAgentQuery(enriched, {
      includeRagAgent: true,
      maxIterations: 12,
    });

    return {
      answer: result.response || "",
      sources: ragResult?.sources || [],
      toolsUsed: Array.isArray(result.toolsUsed) ? result.toolsUsed : [],
    };
  }

  async runMcpExecutor(query) {
    const result = await executeAgentQuery(query, {
      includeRagAgent: false,
      maxIterations: 10,
    });

    return {
      answer: result.response || "",
      sources: [],
      toolsUsed: Array.isArray(result.toolsUsed) ? result.toolsUsed : [],
    };
  }

  async runLlmExecutor(query) {
    const llm = getChatModel();
    const response = await llm.invoke(query);
    const answer = typeof response.content === "string" ? response.content : String(response.content || "");
    return {
      answer: answer || "No response generated.",
      sources: [],
      toolsUsed: [],
    };
  }

  async tryRag(query, ragMode) {
    try {
      if (ragMode === "advanced") {
        return await ragService.agenticRetrieve(query);
      }
      return await ragService.baselineRetrieve(query);
    } catch (error) {
      return {
        answer: "",
        sources: [],
      };
    }
  }

  formatResultFromRag(ragResult) {
    return {
      answer: ragResult.answer || "No response generated.",
      sources: ragResult.sources || [],
      toolsUsed: [],
    };
  }

  async getStatus() {
    const readiness = await checkAgentReadiness().catch(() => ({ ready: false, toolCount: 0 }));
    return {
      ready: this.initialized,
      mcpReady: readiness.ready,
      toolCount: this.tools.length,
      ragEnabled: this.ragEnabled,
      runtimeMode: getRuntimeConfig().mode,
    };
  }

  async getAvailableTools() {
    if (!this.initialized) {
      await this.initialize();
    }
    return (this.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }
}

const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;
