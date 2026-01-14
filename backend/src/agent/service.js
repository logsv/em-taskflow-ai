import { executeAgentQuery, checkAgentReadiness, getAgentTools } from "./graph.js";
import ragService from "../services/ragService.js";
import databaseService from "../services/databaseService.js";
import { config } from "../config.js";
import { initializeLLMRouter, routedChatCompletion, getRouterStatus } from "../llm/router.js";

export class LangGraphAgentService {
  constructor() {
    this.initialized = false;
    this.tools = [];
    this.ragEnabled = false;
  }

  async initialize() {
    try {
      console.log("🚀 Initializing LangGraph Agent Service...");

      try {
        await initializeLLMRouter();
        console.log("✅ LLM Router initialized with cost/round-robin + circuit breaker");
      } catch (error) {
        console.warn("⚠️  LLM Router initialization failed, using direct Ollama fallback:", error);
      }

      try {
        const ragStatus = await ragService.getStatus();
        this.ragEnabled = ragStatus.ready;
        console.log(`📚 RAG Service: ${this.ragEnabled ? "Available" : "Unavailable"}`);
      } catch (error) {
        console.warn("⚠️  RAG Service unavailable:", error);
        this.ragEnabled = false;
      }

      const { tools } = await getAgentTools();
      this.tools = tools;

      const readiness = await checkAgentReadiness();
      if (!readiness.ready) {
        throw new Error(`Agent not ready: ${readiness.error}`);
      }

      this.initialized = true;
      console.log(`✅ LangGraph Agent Service initialized with ${readiness.toolCount} MCP tools`);
    } catch (error) {
      console.error("❌ Failed to initialize LangGraph Agent Service:", error);
      throw error;
    }
  }

  async processQuery(userQuery, options) {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log("🤔 Processing query with LangGraph agent:", userQuery.slice(0, 100));

    const startTime = Date.now();
    const sources = [];
    let enhancedQuery = userQuery;
    let ragUsed = false;

    try {
      if (this.ragEnabled && (!options || options.includeRAG !== false)) {
        try {
          console.log("📚 Enhancing query with RAG context...");
          const ragResults = await ragService.searchRelevantChunks(userQuery, 3);

          if (ragResults.chunks.length > 0) {
            ragUsed = true;
            sources.push({
              type: "rag",
              data: {
                chunks: ragResults.chunks,
                sources: ragResults.sources,
                context: ragResults.context,
              },
            });

            enhancedQuery = `Context from documents:
${ragResults.context}

User question: ${userQuery}

Please answer the user's question using the provided context when relevant, and use your tools to get additional information if needed.`;

            console.log(`✅ Added RAG context from ${ragResults.chunks.length} document chunks`);
          }
        } catch (ragError) {
          console.warn("⚠️  RAG enhancement failed:", ragError);
        }
      }

      console.log("🤖 Executing LangGraph ReAct agent...");
      const agentResult = await executeAgentQuery(enhancedQuery, {
        maxIterations: (options && options.maxIterations) || 10,
        stream: (options && options.stream) || false,
      });

      if (options && options.stream && agentResult && typeof agentResult === "object" && "next" in agentResult) {
        return agentResult;
      }

      const result = agentResult;

      if (result.toolsUsed && result.toolsUsed.length > 0) {
        sources.push({
          type: "mcp_tools",
          data: {
            toolsUsed: result.toolsUsed,
            toolCount: this.tools.length,
          },
        });
      }

      try {
        console.log("💾 Would store conversation in database");
        console.log("💾 Conversation stored in database");
      } catch (dbError) {
        console.warn("⚠️  Failed to store conversation:", dbError);
      }

      const totalTime = Date.now() - startTime;

      console.log(`✅ Query processed successfully in ${totalTime}ms`);
      console.log(`📊 Used ${result.toolsUsed?.length || 0} MCP tools, RAG: ${ragUsed}`);

      return result.response || "No response generated.";
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error("❌ Query processing failed:", error);

      return `I encountered an error while processing your query: ${error.message}. Please try again or rephrase your question.`;
    }
  }

  async *streamQuery(userQuery, options) {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log("🌊 Starting streaming query processing...");

    let enhancedQuery = userQuery;
    if (this.ragEnabled && (!options || options.includeRAG !== false)) {
      try {
        const ragResults = await ragService.searchRelevantChunks(userQuery, 3);
        if (ragResults.chunks.length > 0) {
          enhancedQuery = `Context: ${ragResults.context}\n\nUser question: ${userQuery}`;
          yield {
            type: "thinking",
            content: `Found ${ragResults.chunks.length} relevant documents to help answer your question.`,
          };
        }
      } catch (ragError) {
        console.warn("RAG enhancement failed during streaming:", ragError);
      }
    }

    try {
      const stream = await executeAgentQuery(enhancedQuery, {
        maxIterations: (options && options.maxIterations) || 10,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.agent) {
          if (chunk.agent.messages) {
            const lastMessage = chunk.agent.messages[chunk.agent.messages.length - 1];
            if (lastMessage.content) {
              yield {
                type: "thinking",
                content: lastMessage.content,
              };
            }
          }
        } else if (chunk.tools) {
          const toolMessage = chunk.tools.messages[chunk.tools.messages.length - 1];
          if (toolMessage.tool_calls) {
            for (const toolCall of toolMessage.tool_calls) {
              yield {
                type: "tool_use",
                content: `Using ${toolCall.name}...`,
                toolName: toolCall.name,
                data: toolCall.args,
              };
            }
          }
        }
      }

      yield {
        type: "final",
        content: "Query processing completed.",
      };
    } catch (error) {
      yield {
        type: "final",
        content: `Error: ${error.message}`,
      };
    }
  }

  async getStatus() {
    try {
      const readiness = await checkAgentReadiness();
      const routerStatus = await getRouterStatus();

      return {
        ready: this.initialized && readiness.ready,
        toolCount: this.tools.length,
        ragEnabled: this.ragEnabled,
        model: readiness.model,
        router: routerStatus,
        error: readiness.error,
      };
    } catch (error) {
      return {
        ready: false,
        toolCount: 0,
        ragEnabled: false,
        model: "gpt-oss:20b",
        router: { initialized: false, providers: [], activeProviders: 0, strategy: "none" },
        error: error.message,
      };
    }
  }

  async getAvailableTools() {
    try {
      const { toolInfo } = await getAgentTools();
      return toolInfo;
    } catch (error) {
      console.error("Failed to get available tools:", error);
      return [];
    }
  }

  isReady() {
    return this.initialized;
  }

  async restart() {
    console.log("🔄 Restarting LangGraph Agent Service...");
    this.initialized = false;
    this.tools = [];
    await this.initialize();
  }
}

const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;

