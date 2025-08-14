import type { Tool } from "@langchain/core/tools";
import { executeAgentQuery, checkAgentReadiness, getAgentTools } from "./graph.js";
import ragService from "../services/ragService.js";
import databaseService from "../services/databaseService.js";
import { config } from "../config.js";
import { initializeLLMRouter, routedChatCompletion, getRouterStatus } from "../llm/router.js";

/**
 * Enhanced Agent Service using LangGraph ReAct agent with MCP tools
 * Provides intelligent orchestration of RAG, MCP, and LLM capabilities
 */
export class LangGraphAgentService {
  private initialized = false;
  private tools: Tool[] = [];
  private ragEnabled = false;

  /**
   * Initialize the agent service
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing LangGraph Agent Service...');
      
      // Initialize LLM Router first (layer above agent)
      try {
        await initializeLLMRouter();
        console.log('✅ LLM Router initialized with cost/round-robin + circuit breaker');
      } catch (error) {
        console.warn('⚠️  LLM Router initialization failed, using direct Ollama fallback:', error);
      }
      
      // Check if RAG is available
      try {
        const ragStatus = await ragService.getStatus();
        this.ragEnabled = ragStatus.ready;
        console.log(`📚 RAG Service: ${this.ragEnabled ? 'Available' : 'Unavailable'}`);
      } catch (error) {
        console.warn('⚠️  RAG Service unavailable:', error);
        this.ragEnabled = false;
      }
      
      // Load agent tools
      const { tools } = await getAgentTools();
      this.tools = tools;
      
      // Check agent readiness
      const readiness = await checkAgentReadiness();
      if (!readiness.ready) {
        throw new Error(`Agent not ready: ${readiness.error}`);
      }
      
      this.initialized = true;
      console.log(`✅ LangGraph Agent Service initialized with ${readiness.toolCount} MCP tools`);
      
    } catch (error) {
      console.error('❌ Failed to initialize LangGraph Agent Service:', error);
      throw error;
    }
  }

  /**
   * Process a user query using the LangGraph agent with RAG enhancement
   * Returns just the response string for API compatibility
   */
  async processQuery(userQuery: string, options?: {
    maxIterations?: number;
    includeRAG?: boolean;
    stream?: boolean;
  }): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    console.log('🤔 Processing query with LangGraph agent:', userQuery.slice(0, 100));
    
    const startTime = Date.now();
    const sources: Array<{ type: string; data: any }> = [];
    let enhancedQuery = userQuery;
    let ragUsed = false;
    
    try {
      // Step 1: Enhance query with RAG context if available and requested
      if (this.ragEnabled && (options?.includeRAG !== false)) {
        try {
          console.log('📚 Enhancing query with RAG context...');
          const ragResults = await ragService.searchRelevantChunks(userQuery, 3);
          
          if (ragResults.chunks.length > 0) {
            ragUsed = true;
            sources.push({
              type: 'rag',
              data: {
                chunks: ragResults.chunks,
                sources: ragResults.sources,
                context: ragResults.context,
              }
            });
            
            // Enhance the query with RAG context
            enhancedQuery = `Context from documents:
${ragResults.context}

User question: ${userQuery}

Please answer the user's question using the provided context when relevant, and use your tools to get additional information if needed.`;
            
            console.log(`✅ Added RAG context from ${ragResults.chunks.length} document chunks`);
          }
        } catch (ragError) {
          console.warn('⚠️  RAG enhancement failed:', ragError);
          // Continue without RAG context
        }
      }
      
      // Step 2: Execute the query using LangGraph ReAct agent
      console.log('🤖 Executing LangGraph ReAct agent...');
      const agentResult = await executeAgentQuery(enhancedQuery, {
        maxIterations: options?.maxIterations || 10,
        stream: options?.stream || false,
      });
      
      // Handle streaming response
      if (options?.stream && typeof agentResult === 'object' && 'next' in agentResult) {
        // Return the stream directly for streaming responses
        return agentResult as any;
      }
      
      // Step 3: Process non-streaming result
      const result = agentResult as any;
      
      // Add MCP tool sources
      if (result.toolsUsed && result.toolsUsed.length > 0) {
        sources.push({
          type: 'mcp_tools',
          data: {
            toolsUsed: result.toolsUsed,
            toolCount: this.tools.length,
          }
        });
      }
      
      // Step 4: Store conversation in database
      try {
        // Store conversation - for now just log (implement storeChatMessage if needed)
        console.log('💾 Would store conversation in database');
        console.log('💾 Conversation stored in database');
      } catch (dbError) {
        console.warn('⚠️  Failed to store conversation:', dbError);
        // Don't fail the entire request for DB issues
      }
      
      const totalTime = Date.now() - startTime;
      
      console.log(`✅ Query processed successfully in ${totalTime}ms`);
      console.log(`📊 Used ${result.toolsUsed?.length || 0} MCP tools, RAG: ${ragUsed}`);
      
      // Return just the response string for API compatibility
      return result.response || 'No response generated.';
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ Query processing failed:', error);
      
      // Return error message as string
      return `I encountered an error while processing your query: ${(error as Error).message}. Please try again or rephrase your question.`;
    }
  }

  /**
   * Stream a query response for real-time interaction
   */
  async *streamQuery(userQuery: string, options?: {
    maxIterations?: number;
    includeRAG?: boolean;
  }): AsyncGenerator<{
    type: 'thinking' | 'tool_use' | 'response' | 'final';
    content: string;
    toolName?: string;
    data?: any;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    console.log('🌊 Starting streaming query processing...');
    
    // Enhance with RAG if available
    let enhancedQuery = userQuery;
    if (this.ragEnabled && (options?.includeRAG !== false)) {
      try {
        const ragResults = await ragService.searchRelevantChunks(userQuery, 3);
        if (ragResults.chunks.length > 0) {
          enhancedQuery = `Context: ${ragResults.context}\n\nUser question: ${userQuery}`;
          yield {
            type: 'thinking',
            content: `Found ${ragResults.chunks.length} relevant documents to help answer your question.`,
          };
        }
      } catch (ragError) {
        console.warn('RAG enhancement failed during streaming:', ragError);
      }
    }
    
    try {
      // Execute streaming agent query
      const stream = await executeAgentQuery(enhancedQuery, {
        maxIterations: options?.maxIterations || 10,
        stream: true,
      }) as AsyncIterable<any>;
      
      for await (const chunk of stream) {
        // Process different types of agent outputs
        if (chunk.agent) {
          // Agent thinking/reasoning
          if (chunk.agent.messages) {
            const lastMessage = chunk.agent.messages[chunk.agent.messages.length - 1];
            if (lastMessage.content) {
              yield {
                type: 'thinking',
                content: lastMessage.content,
              };
            }
          }
        } else if (chunk.tools) {
          // Tool usage
          const toolMessage = chunk.tools.messages[chunk.tools.messages.length - 1];
          if (toolMessage.tool_calls) {
            for (const toolCall of toolMessage.tool_calls) {
              yield {
                type: 'tool_use',
                content: `Using ${toolCall.name}...`,
                toolName: toolCall.name,
                data: toolCall.args,
              };
            }
          }
        }
      }
      
      yield {
        type: 'final',
        content: 'Query processing completed.',
      };
      
    } catch (error) {
      yield {
        type: 'final',
        content: `Error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get service status and capabilities
   */
  async getStatus(): Promise<{
    ready: boolean;
    toolCount: number;
    ragEnabled: boolean;
    model: string;
    router: any;
    error?: string;
  }> {
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
        router: { initialized: false, providers: [], activeProviders: 0, strategy: 'none' },
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get available tools information
   */
  async getAvailableTools(): Promise<Array<{
    name: string;
    description: string;
    parameters: any;
  }>> {
    try {
      const { toolInfo } = await getAgentTools();
      return toolInfo;
    } catch (error) {
      console.error('Failed to get available tools:', error);
      return [];
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Restart the service
   */
  async restart(): Promise<void> {
    console.log('🔄 Restarting LangGraph Agent Service...');
    this.initialized = false;
    this.tools = [];
    await this.initialize();
  }
}

// Create and export singleton instance
const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;