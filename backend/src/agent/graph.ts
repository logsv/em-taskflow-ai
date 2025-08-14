/**
 * Agent Graph - createReactAgent with MCP tools
 * Core LangGraph agent implementation with tool integration
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { Tool } from "@langchain/core/tools";
import { getChatOllama, routedChatCompletion, isRouterInitialized } from "../llm/index.js";
import { getMCPTools, isMCPReady, initializeMCP } from "../mcp/index.js";

// Agent state
let reactAgent: any = null;
let agentTools: Tool[] = [];
let initialized = false;

/**
 * Initialize the ReAct agent with MCP tools
 */
export async function initializeAgent(): Promise<void> {
  if (initialized) return;

  console.log('🤖 Initializing LangGraph ReAct agent...');

  try {
    // Ensure MCP is ready
    if (!isMCPReady()) {
      console.log('🔧 Initializing MCP services...');
      await initializeMCP();
    }

    // Get MCP tools
    agentTools = getMCPTools();
    console.log(`📋 Loaded ${agentTools.length} MCP tools:`, agentTools.map(t => t.name));

    // Get LLM instance
    const llm = getChatOllama();

    // Create ReAct agent with MCP tools
    reactAgent = createReactAgent({
      llm,
      tools: agentTools,
      messageModifier: `You are a helpful AI assistant with access to various tools through MCP (Model Context Protocol).

Available tools:
${agentTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

Guidelines:
1. Think step by step about which tool(s) to use
2. Use tools when you need external data (Notion, Jira, Google Calendar, etc.)
3. Combine tool results with your knowledge for comprehensive answers
4. If a tool fails, explain what went wrong and try alternatives
5. Always be helpful, accurate, and cite your sources

When processing queries with document context, prioritize that context but use tools for additional information when helpful.`,
    });

    initialized = true;
    console.log(`✅ ReAct agent initialized with ${agentTools.length} tools`);

  } catch (error) {
    console.error('❌ Failed to initialize ReAct agent:', error);
    throw error;
  }
}

/**
 * Execute agent query
 */
export async function executeAgentQuery(
  query: string,
  options: {
    maxIterations?: number;
    stream?: boolean;
  } = {}
): Promise<string | AsyncIterable<any>> {
  await ensureAgentReady();

  const { maxIterations = 10, stream = false } = options;

  try {
    console.log('🔍 Executing agent query:', query.slice(0, 100) + '...');

    if (stream) {
      // Return streaming response
      return reactAgent.stream(
        { messages: [{ role: "user", content: query }] },
        { 
          configurable: { 
            thread_id: `thread_${Date.now()}` 
          },
          recursionLimit: maxIterations,
        }
      );
    } else {
      // Return standard response
      const result = await reactAgent.invoke(
        { messages: [{ role: "user", content: query }] },
        {
          configurable: {
            thread_id: `thread_${Date.now()}`
          },
          recursionLimit: maxIterations,
        }
      );

      // Extract the response from the result
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage && lastMessage.content) {
        return typeof lastMessage.content === 'string' 
          ? lastMessage.content 
          : String(lastMessage.content);
      }

      return 'No response generated.';
    }

  } catch (error) {
    console.error('❌ Agent query execution failed:', error);
    throw error;
  }
}

/**
 * Check agent readiness
 */
export async function checkAgentReadiness(): Promise<{
  ready: boolean;
  model: string;
  toolCount: number;
  error?: string;
}> {
  try {
    if (!initialized) {
      await initializeAgent();
    }

    return {
      ready: initialized && !!reactAgent && agentTools.length > 0,
      model: 'gpt-oss:latest',
      toolCount: agentTools.length,
    };

  } catch (error) {
    return {
      ready: false,
      model: 'gpt-oss:latest',
      toolCount: 0,
      error: (error as Error).message,
    };
  }
}

/**
 * Get agent tools information
 */
export async function getAgentTools(): Promise<{
  tools: Tool[];
  toolInfo: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
}> {
  await ensureAgentReady();

  const toolInfo = agentTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.schema || {},
  }));

  return {
    tools: agentTools,
    toolInfo,
  };
}

/**
 * Get agent instance (for advanced usage)
 */
export function getAgentInstance() {
  return reactAgent;
}

/**
 * Reset agent (force reinitialization)
 */
export async function resetAgent(): Promise<void> {
  console.log('🔄 Resetting ReAct agent...');
  
  initialized = false;
  reactAgent = null;
  agentTools = [];
  
  await initializeAgent();
}

/**
 * Ensure agent is ready for queries
 */
async function ensureAgentReady(): Promise<void> {
  if (!initialized || !reactAgent) {
    await initializeAgent();
  }
}