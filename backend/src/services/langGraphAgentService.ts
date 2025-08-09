// LangGraph-based Agent Service with mcp-use integration and proper StateGraph workflow
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { MCPAgent, MCPClient } from 'mcp-use';
import databaseService from './databaseService.js';
import ragService from './ragService.js';
import { config, getLlmConfig, getMcpConfig } from '../config/index.js';

// Define the state using Annotation.Root for proper LangGraph integration
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userQuery: Annotation<string>({
    reducer: (x, y) => y ?? x ?? '',
    default: () => '',
  }),
  intent: Annotation<string>({
    reducer: (x, y) => y ?? x ?? '',
    default: () => '',
  }),
  needsExternalData: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  needsDocumentSearch: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  ragResults: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  mcpResults: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  finalResponse: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  error: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});

// Type definition for the state
type AgentStateType = typeof AgentState.State;

// Initialize MCP Client and Agent using mcp-use
let mcpClient: MCPClient | null = null;
let mcpAgent: MCPAgent | null = null;

async function initializeMCPAgent(): Promise<MCPAgent> {
  if (mcpAgent) return mcpAgent;

  try {
    // Get MCP configuration
    const mcpConfig = getMcpConfig();
    const llmConfig = getLlmConfig();
    
    // Build MCP servers config for mcp-use
    const mcpServers: Record<string, any> = {};
    
    // Add Notion server if enabled
    if (mcpConfig.notion.enabled && mcpConfig.notion.apiKey) {
      mcpServers.notion = {
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: {
          NOTION_TOKEN: mcpConfig.notion.apiKey,
          NOTION_VERSION: '2022-06-28'
        }
      };
    }

    // Create MCP client
    mcpClient = MCPClient.fromDict({ mcpServers });

    // Initialize LLM - prefer OpenAI if available, fallback to Ollama
    let llm;
    const openaiKey = llmConfig.providers.openai.apiKey || process.env.OPENAI_API_KEY;
    
    if (openaiKey && openaiKey.trim() !== '') {
      llm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        apiKey: openaiKey,
        temperature: 0.7
      });
      console.log('✅ Using OpenAI for MCP Agent');
    } else {
      llm = new ChatOllama({
        baseUrl: "http://127.0.0.1:11434",
        model: "mistral:latest",
        temperature: 0.7,
      });
      console.log('✅ Using Ollama for MCP Agent');
    }

    // Create MCP Agent
    mcpAgent = new MCPAgent({ 
      llm, 
      client: mcpClient, 
      maxSteps: 10 
    });

    console.log('✅ MCP Agent initialized with mcp-use');
    return mcpAgent;
  } catch (error) {
    console.error('❌ Failed to initialize MCP Agent:', error);
    throw error;
  }
}

/**
 * Intent Analysis Node - Analyzes user query and routes to appropriate data sources
 */
async function intentAnalysisNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🎯 StateGraph Node: Intent Analysis');
  
  const text = state.userQuery.toLowerCase();
  const containsAny = (parts: string[]) => parts.some((p) => text.includes(p));

  let intent = 'general';
  let needsExternalData = false;
  let needsDocumentSearch = true; // Always search documents for context

  // Determine intent and data needs
  if (containsAny(['notion', 'page', 'database', 'workspace', 'list', 'show', 'get'])) {
    intent = 'notion_query';
    needsExternalData = true;
  } else if (containsAny(['jira', 'ticket', 'issue', 'sprint', 'story'])) {
    intent = 'jira_query';
    needsExternalData = true;
  } else if (containsAny(['calendar', 'meeting', 'schedule', 'event', 'appointment'])) {
    intent = 'calendar_query';
    needsExternalData = true;
  } else if (containsAny(['status', 'progress', 'update', 'summary'])) {
    intent = 'status_check';
    needsExternalData = true;
  } else if (containsAny(['task', 'todo', 'assignment', 'work', 'project'])) {
    intent = 'task_management';
    needsExternalData = true;
  }

  return {
    intent,
    needsExternalData,
    needsDocumentSearch,
    messages: [...state.messages, new AIMessage(`Intent: ${intent}, External data: ${needsExternalData}`)]
  };
}

/**
 * RAG Search Node - Searches for relevant documents using RAG service
 */
async function ragSearchNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('📚 StateGraph Node: RAG Search');
  
  if (!state.needsDocumentSearch) {
    return {
      ragResults: {
        chunks: [],
        context: 'Document search not needed for this query',
        sources: [],
        found: 0
      },
      messages: [...state.messages, new AIMessage('Skipping document search')]
    };
  }
  
  try {
    const ragStatus = await ragService.getStatus();
    
    if (ragStatus.ready) {
      console.log('🔍 Performing RAG document search');
      const ragResults = await ragService.searchRelevantChunks(state.userQuery, 5);
      
      return {
        ragResults: {
          chunks: ragResults.chunks,
          context: ragResults.context,
          sources: ragResults.sources,
          found: ragResults.chunks.length
        },
        messages: [...state.messages, new AIMessage(`Found ${ragResults.chunks.length} relevant documents`)]
      };
    } else {
      return {
        ragResults: {
          chunks: [],
          context: 'RAG service not available',
          sources: [],
          found: 0
        },
        messages: [...state.messages, new AIMessage('RAG service unavailable')]
      };
    }
  } catch (error) {
    console.error('❌ RAG search failed:', error);
    return {
      ragResults: {
        chunks: [],
        context: 'RAG search failed',
        sources: [],
        found: 0
      },
      messages: [...state.messages, new AIMessage('RAG search failed')]
    };
  }
}

/**
 * MCP Tools Node - Uses mcp-use MCPAgent to execute external tools
 */
async function mcpToolsNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🔧 StateGraph Node: MCP Tools with mcp-use');
  
  if (!state.needsExternalData) {
    return {
      mcpResults: {
        response: 'External data not needed for this query',
        success: false
      },
      messages: [...state.messages, new AIMessage('Skipping external tools')]
    };
  }

  try {
    console.log('🔄 Initializing mcp-use MCPAgent...');
    const agent = await initializeMCPAgent();
    
    console.log('🤖 Executing query with mcp-use MCPAgent');
    const result = await agent.run(state.userQuery);
    
    return {
      mcpResults: {
        response: result,
        success: true
      },
      messages: [...state.messages, new AIMessage('Successfully executed MCP tools with mcp-use')]
    };
  } catch (error) {
    console.error('❌ mcp-use MCPAgent execution failed:', error);
    return {
      mcpResults: {
        response: `MCP tools execution failed: ${(error as Error).message}`,
        success: false
      },
      messages: [...state.messages, new AIMessage('MCP tools execution failed')]
    };
  }
}

/**
 * Response Generation Node - Generates final response using all collected data
 */
async function responseGenerationNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('💬 StateGraph Node: Response Generation');
  
  // Build context from all collected data
  let context = 'Based on the analysis and data collection:\n\n';
  
  // Add intent information
  context += `User Intent: ${state.intent}\n\n`;

  // Add RAG results
  if (state.ragResults) {
    if (state.ragResults.found > 0) {
      context += `Document Search Results (${state.ragResults.found} chunks found):\n`;
      context += state.ragResults.context + '\n\n';
    } else {
      context += 'Document Search: No relevant documents found\n\n';
    }
  }

  // Add MCP results
  if (state.mcpResults) {
    if (state.mcpResults.success) {
      context += 'External Services Data:\n';
      context += state.mcpResults.response + '\n\n';
    } else {
      context += 'External Services: Not used or unavailable\n\n';
    }
  }

  // Generate response using LLM with structured context
  const systemPrompt = `You are an AI assistant for task and project management with access to multiple data sources.

User Query: "${state.userQuery}"

${context}

Provide a comprehensive, helpful response that:
1. Addresses the user's specific query
2. Uses relevant information from documents and external services
3. Offers actionable insights and recommendations
4. Maintains a professional and helpful tone

Focus on being practical and valuable to the user.`;

  try {
    // Initialize LLM
    const llmConfig = getLlmConfig();
    let llm;
    const openaiKey = llmConfig.providers.openai.apiKey || process.env.OPENAI_API_KEY;
    
    if (openaiKey && openaiKey.trim() !== '') {
      llm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        apiKey: openaiKey,
        temperature: 0.7
      });
    } else {
      llm = new ChatOllama({
        baseUrl: "http://127.0.0.1:11434",
        model: "mistral:latest",
        temperature: 0.7,
      });
    }

    const messages = [new HumanMessage(systemPrompt)];
    const response = await llm.invoke(messages);
    const finalResponse = response.content as string;

    return {
      finalResponse,
      messages: [...state.messages, new AIMessage('Generated comprehensive response')]
    };
  } catch (error) {
    console.error('❌ Response generation failed:', error);
    const errorResponse = 'I apologize, but I encountered an error while generating a response. Please try again.';
    return {
      finalResponse: errorResponse,
      error: (error as Error).message,
      messages: [...state.messages, new AIMessage('Response generation failed')]
    };
  }
}

/**
 * Database Save Node - Saves the conversation to database
 */
async function databaseSaveNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('💾 StateGraph Node: Database Save');
  
  try {
    await databaseService.saveChatHistory(state.userQuery, state.finalResponse || 'No response generated');
    return {
      messages: [...state.messages, new AIMessage('Conversation saved to database')]
    };
  } catch (error) {
    console.error('❌ Database save failed:', error);
    // Don't fail the entire flow for database errors
    return {
      messages: [...state.messages, new AIMessage('Warning: Could not save conversation to database')]
    };
  }
}


// Conditional edge functions for StateGraph routing
function shouldExecuteRAG(state: AgentStateType): string {
  return state.needsDocumentSearch ? 'rag_search' : 'mcp_tools';
}

function shouldExecuteMCP(state: AgentStateType): string {
  return state.needsExternalData ? 'mcp_tools' : 'response_generation';
}

function shouldGenerateResponse(state: AgentStateType): string {
  // Always go to response generation after data collection
  return 'response_generation';
}

// Build the StateGraph workflow using proper LangGraphJS API
function buildStateGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode('intent_analysis', intentAnalysisNode)
    .addNode('rag_search', ragSearchNode)
    .addNode('mcp_tools', mcpToolsNode)
    .addNode('response_generation', responseGenerationNode)
    .addNode('database_save', databaseSaveNode);

  // Add edges - proper StateGraph workflow with conditional routing
  workflow.addEdge(START, 'intent_analysis');
  
  // Conditional edge from intent analysis - decide whether to do RAG search first
  workflow.addConditionalEdges(
    'intent_analysis',
    shouldExecuteRAG,
    {
      'rag_search': 'rag_search',
      'mcp_tools': 'mcp_tools'
    }
  );
  
  // From RAG search, conditionally go to MCP tools or response generation
  workflow.addConditionalEdges(
    'rag_search',
    shouldExecuteMCP,
    {
      'mcp_tools': 'mcp_tools',
      'response_generation': 'response_generation'
    }
  );
  
  // From MCP tools, always go to response generation
  workflow.addEdge('mcp_tools', 'response_generation');
  
  // From response generation, go to database save
  workflow.addEdge('response_generation', 'database_save');
  
  // From database save, end the workflow
  workflow.addEdge('database_save', END);

  return workflow;
}

/**
 * Execute the StateGraph workflow with proper LangGraph implementation
 */
async function executeWorkflow(initialState: AgentStateType): Promise<AgentStateType> {
  console.log('🚀 Executing proper LangGraph StateGraph workflow');
  
  try {
    const workflow = buildStateGraph();
    const compiled = workflow.compile();
    
    console.log('📊 StateGraph compiled successfully, executing...');
    const result = await compiled.invoke(initialState);
    
    console.log('✅ StateGraph workflow completed successfully');
    return result as AgentStateType;
  } catch (error) {
    console.error('❌ StateGraph workflow failed:', error);
    throw error;
  }
}

/**
 * Main function to process user queries using proper LangGraph StateGraph
 */
async function processQuery(userQuery: string): Promise<string> {
  console.log('🚀 Starting LangGraph StateGraph Agent Workflow for query:', userQuery);
  
  try {
    // Initial state using proper StateGraph structure
    const initialState: AgentStateType = {
      messages: [new HumanMessage(userQuery)],
      userQuery,
      intent: '',
      needsExternalData: false,
      needsDocumentSearch: true,
      ragResults: undefined,
      mcpResults: undefined,
      finalResponse: undefined,
      error: undefined
    };

    // Execute the StateGraph workflow
    const finalState = await executeWorkflow(initialState);

    console.log('✅ LangGraph StateGraph workflow completed successfully');
    return finalState.finalResponse || 'No response generated';

  } catch (error) {
    console.error('❌ LangGraph StateGraph workflow failed:', error);
    const errorResponse = 'I apologize, but I encountered an error while processing your request. Please try again.';
    
    // Still try to save error case
    try {
      await databaseService.saveChatHistory(userQuery, errorResponse);
    } catch (dbError) {
      console.error('Failed to save error to database:', dbError);
    }
    
    return errorResponse;
  }
}

// Export the LangGraph-based agent service
const langGraphAgentService = {
  processQuery
};

export default langGraphAgentService;