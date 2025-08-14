// Enhanced LangGraph-based Agent Service with full agentic RAG best practices
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { Tool } from '@langchain/core/tools';
import databaseService from './databaseService.js';
import mcpService from './mcpService.js';
import enhancedRagService, { type RAGSearchResult, type HallucinationCheck } from './enhancedRagService.js';
import { config, getLlmConfig, getMcpConfig } from '../config.js';

// Enhanced state with new RAG features
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userQuery: Annotation<string>({
    reducer: (x, y) => y ?? x ?? '',
    default: () => '',
  }),
  transformedQuery: Annotation<string>({
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
  ragResults: Annotation<RAGSearchResult>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  mcpResults: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  generatedResponse: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  hallucinationCheck: Annotation<HallucinationCheck>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  finalResponse: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  needsRegeneration: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  error: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});

type AgentStateType = typeof AgentState.State;

// Initialize MCP Client and Agent
let mcpClient: MCPClient | null = null;
let mcpAgent: MCPAgent | null = null;

async function initializeMCPAgent(): Promise<MCPAgent> {
  if (mcpAgent) {
    return mcpAgent;
  }

  try {
    const mcpConfig = getMcpConfig();
    console.log('🔄 Initializing MCP Agent with mcp-use...');

    // Initialize available MCP servers from config - adapt to actual config structure
    const mcpServers: Record<string, any> = {};

    // Add Notion server if enabled
    if (mcpConfig.notion?.enabled && mcpConfig.notion?.apiKey) {
      console.log(`🔌 Adding MCP server: notion`);
      mcpServers.notion = {
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: {
          NOTION_TOKEN: mcpConfig.notion.apiKey,
          NOTION_VERSION: '2022-06-28'
        }
      };
    }

    // Add Jira server if enabled
    if (mcpConfig.jira?.enabled && mcpConfig.jira?.apiToken) {
      console.log(`🔌 Adding MCP server: jira`);
      mcpServers.jira = {
        command: 'npx',
        args: ['-y', '@atlassianlabs/mcp-server-atlassian'],
        env: {
          ATLASSIAN_URL: mcpConfig.jira.url,
          ATLASSIAN_EMAIL: mcpConfig.jira.username,
          ATLASSIAN_API_TOKEN: mcpConfig.jira.apiToken
        }
      };
    }

    // Add Google Calendar server if enabled
    if (mcpConfig.google?.enabled && mcpConfig.google?.oauthCredentials) {
      console.log(`🔌 Adding MCP server: calendar`);
      mcpServers.calendar = {
        command: 'npx',
        args: ['-y', '@cocal/google-calendar-mcp'],
        env: {
          GOOGLE_OAUTH_CREDENTIALS: mcpConfig.google.oauthCredentials,
          GOOGLE_CALENDAR_ID: mcpConfig.google.calendarId
        }
      };
    }

    console.log('🔧 Enabled MCP servers for enhanced agent:', Object.keys(mcpServers));

    // Configure the MCP client with the servers
    if (Object.keys(mcpServers).length > 0) {
      mcpClient = MCPClient.fromDict({ mcpServers });
    } else {
      console.warn('⚠️ No MCP servers configured for enhanced agent');
    }

    const llmConfig = getLlmConfig();
    let llmInstance;
    
    if (llmConfig.defaultProvider === 'openai') {
      llmInstance = new ChatOpenAI({
        modelName: llmConfig.providers.openai.model,
        openAIApiKey: llmConfig.providers.openai.apiKey,
        temperature: 0.1
      });
    } else {
      llmInstance = new ChatOllama({
        baseUrl: llmConfig.providers.ollama.baseUrl,
        model: llmConfig.providers.ollama.model,
        temperature: 0.1
      });
    }

    mcpAgent = new MCPAgent({
      client: mcpClient,
      llm: llmInstance,
      systemPrompt: "You are a helpful assistant with access to external tools. Use them when needed to provide accurate information."
    });

    console.log('✅ Enhanced MCP Agent initialized successfully');
    return mcpAgent;
  } catch (error) {
    console.error('❌ Failed to initialize enhanced MCP Agent:', error);
    throw error;
  }
}

/**
 * Enhanced Intent Analysis Node with better decision making
 */
async function intentAnalysisNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🎯 StateGraph Node: Enhanced Intent Analysis');
  
  try {
    const llmConfig = getLlmConfig();
    let llm;
    
    if (llmConfig.defaultProvider === 'openai') {
      llm = new ChatOpenAI({
        modelName: llmConfig.providers.openai.model,
        openAIApiKey: llmConfig.providers.openai.apiKey,
        temperature: 0.1
      });
    } else {
      llm = new ChatOllama({
        baseUrl: llmConfig.providers.ollama.baseUrl,
        model: llmConfig.providers.ollama.model,
        temperature: 0.1
      });
    }

    const intentPrompt = `Analyze the user's query and determine:
1. The main intent/purpose
2. Whether external data (APIs, tools) is needed
3. Whether document search would be helpful
4. The complexity level of the query

Available external services:
- Notion API (for pages, databases, todos, notes, documents)
- Jira API (for tickets, issues, projects)
- Google Calendar API (for events, scheduling)

External data is needed for queries about:
- "my notion pages", "notion docs", "notion databases", "notion todos"
- "jira tickets", "jira issues", "project status"  
- "my calendar", "schedule", "meetings", "events"
- Any query requesting current/live data from these services

User query: "${state.userQuery}"

Respond with a JSON object:
{
  "intent": "brief description of the intent",
  "needsExternalData": true/false,
  "needsDocumentSearch": true/false,
  "complexity": "simple|moderate|complex",
  "reasoning": "explanation of your analysis"
}`;

    const response = await llm.invoke(intentPrompt);
    const rawResponse = response.content.toString().trim();
    
    // Extract JSON from response, handling cases where LLM adds extra text
    let jsonStr = rawResponse;
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const analysis = JSON.parse(jsonStr);
    
    console.log('🎯 Enhanced intent analysis:', analysis);
    
    return {
      intent: analysis.intent,
      needsExternalData: analysis.needsExternalData,
      needsDocumentSearch: analysis.needsDocumentSearch,
      messages: [...state.messages, new AIMessage(`Intent: ${analysis.intent}, External data: ${analysis.needsExternalData}, Document search: ${analysis.needsDocumentSearch}`)]
    };
  } catch (error) {
    console.error('❌ Enhanced intent analysis failed:', error);
    
    // Fallback detection for MCP services when JSON parsing fails
    const query = state.userQuery.toLowerCase();
    const needsExternalData = query.includes('notion') || query.includes('jira') || 
                             query.includes('calendar') || query.includes('my pages') ||
                             query.includes('my docs') || query.includes('my todos');
    
    return {
      intent: 'general_query',
      needsExternalData,
      needsDocumentSearch: true,
      messages: [...state.messages, new AIMessage(`Intent analysis failed, using fallback detection. External data needed: ${needsExternalData}`)]
    };
  }
}

/**
 * Enhanced RAG Search Node with query transformation and relevance grading
 */
async function enhancedRagSearchNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('📚 StateGraph Node: Enhanced RAG Search');
  
  if (!state.needsDocumentSearch) {
    return {
      ragResults: {
        chunks: [],
        context: 'Document search not needed for this query',
        sources: [],
        original_query: state.userQuery
      },
      messages: [...state.messages, new AIMessage('Skipping document search - not needed')]
    };
  }
  
  try {
    const ragStatus = await enhancedRagService.getStatus();
    
    if (ragStatus.ready) {
      console.log('🔍 Performing enhanced RAG search with query transformation and grading');
      const ragResults = await enhancedRagService.searchRelevantChunks(state.userQuery, 5);
      
      return {
        ragResults,
        transformedQuery: ragResults.transformed_query || state.userQuery,
        messages: [...state.messages, new AIMessage(`Enhanced RAG found ${ragResults.chunks.length} relevant documents (query transformed: ${ragResults.original_query !== ragResults.transformed_query})`)]
      };
    } else {
      return {
        ragResults: {
          chunks: [],
          context: 'Enhanced RAG service not available',
          sources: [],
          original_query: state.userQuery
        },
        messages: [...state.messages, new AIMessage('Enhanced RAG service unavailable')]
      };
    }
  } catch (error) {
    console.error('❌ Enhanced RAG search failed:', error);
    return {
      ragResults: {
        chunks: [],
        context: 'Enhanced RAG search failed',
        sources: [],
        original_query: state.userQuery
      },
      messages: [...state.messages, new AIMessage('Enhanced RAG search failed')]
    };
  }
}

/**
 * MCP Tools Node - Enhanced with better error handling
 */
async function mcpToolsNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🔧 StateGraph Node: Enhanced MCP Tools');
  
  if (!state.needsExternalData) {
    return {
      mcpResults: {
        response: 'External data not needed for this query',
        success: false
      },
      messages: [...state.messages, new AIMessage('Skipping external tools - not needed')]
    };
  }

  try {
    console.log('🔄 Initializing enhanced MCP Agent...');
    const agent = await initializeMCPAgent();
    
    console.log('🤖 Executing query with enhanced MCP Agent');
    const result = await agent.run(state.userQuery, 20); // Increased maxSteps to 20
    
    return {
      mcpResults: {
        response: result,
        success: true
      },
      messages: [...state.messages, new AIMessage('Successfully executed enhanced MCP tools')]
    };
  } catch (error) {
    console.error('❌ Enhanced MCP Agent execution failed:', error);
    return {
      mcpResults: {
        response: 'External tools execution failed',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      messages: [...state.messages, new AIMessage('Enhanced MCP tools execution failed')]
    };
  }
}

/**
 * Enhanced Response Generation Node
 */
async function enhancedResponseGenerationNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🤖 StateGraph Node: Enhanced Response Generation');
  
  try {
    const llmConfig = getLlmConfig();
    let llm;
    
    if (llmConfig.defaultProvider === 'openai') {
      llm = new ChatOpenAI({
        modelName: llmConfig.providers.openai.model,
        openAIApiKey: llmConfig.providers.openai.apiKey,
        temperature: 0.3
      });
    } else {
      llm = new ChatOllama({
        baseUrl: llmConfig.providers.ollama.baseUrl,
        model: llmConfig.providers.ollama.model,
        temperature: 0.3
      });
    }

    // Build enhanced context
    let contextParts = [];
    
    // Add RAG context if available
    if (state.ragResults && state.ragResults.chunks.length > 0) {
      contextParts.push(`DOCUMENT CONTEXT (${state.ragResults.chunks.length} relevant chunks found):`);
      contextParts.push(state.ragResults.context);
      
      if (state.ragResults.transformed_query !== state.ragResults.original_query) {
        contextParts.push(`\nNote: Query was transformed for better retrieval: "${state.ragResults.original_query}" → "${state.ragResults.transformed_query}"`);
      }
    }
    
    // Add MCP results if available
    if (state.mcpResults && state.mcpResults.success) {
      contextParts.push('\nEXTERNAL DATA:');
      contextParts.push(state.mcpResults.response);
    }

    const enhancedPrompt = `You are an intelligent assistant providing comprehensive, accurate answers.

User Query: "${state.userQuery}"
Intent: ${state.intent}

${contextParts.length > 0 ? contextParts.join('\n\n') : 'No additional context available.'}

Instructions:
1. Answer the user's question comprehensively and accurately
2. Base your response primarily on the provided context when available
3. If using document context, cite sources appropriately
4. If external data is provided, integrate it naturally
5. Be honest about limitations and uncertainties
6. Provide actionable insights when possible

Generate a helpful, well-structured response:`;

    const response = await llm.invoke(enhancedPrompt);
    const generatedResponse = response.content.toString().trim();
    
    console.log('✅ Enhanced response generated successfully');
    
    return {
      generatedResponse,
      messages: [...state.messages, new AIMessage('Enhanced response generated')]
    };
  } catch (error) {
    console.error('❌ Enhanced response generation failed:', error);
    const fallbackResponse = 'I apologize, but I encountered an error while generating a response. Please try again.';
    
    return {
      generatedResponse: fallbackResponse,
      messages: [...state.messages, new AIMessage('Enhanced response generation failed')]
    };
  }
}

/**
 * Hallucination Detection Node
 */
async function hallucinationDetectionNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🔍 StateGraph Node: Hallucination Detection');
  
  // Skip hallucination check if no RAG context available
  if (!state.ragResults || !state.ragResults.context || state.ragResults.chunks.length === 0) {
    console.log('⚠️ Skipping hallucination check - no RAG context available');
    return {
      hallucinationCheck: {
        is_grounded: true,
        confidence: 1.0,
        unsupported_claims: [],
        reasoning: 'No document context available for grounding check'
      },
      finalResponse: state.generatedResponse,
      messages: [...state.messages, new AIMessage('Hallucination check skipped - no context available')]
    };
  }
  
  try {
    const hallucinationCheck = await enhancedRagService.checkHallucination(
      state.generatedResponse || '',
      state.ragResults.context
    );
    
    // Decide if response needs regeneration
    const needsRegeneration = !hallucinationCheck.is_grounded && hallucinationCheck.confidence > 0.7;
    
    if (needsRegeneration) {
      console.log('⚠️ Hallucination detected - response needs regeneration');
      return {
        hallucinationCheck,
        needsRegeneration: true,
        messages: [...state.messages, new AIMessage('Hallucination detected - regenerating response')]
      };
    } else {
      console.log('✅ Response passed hallucination check');
      return {
        hallucinationCheck,
        finalResponse: state.generatedResponse,
        needsRegeneration: false,
        messages: [...state.messages, new AIMessage('Response passed hallucination check')]
      };
    }
  } catch (error) {
    console.error('❌ Hallucination detection failed:', error);
    // Default to accepting the response if check fails
    return {
      hallucinationCheck: {
        is_grounded: true,
        confidence: 0.5,
        unsupported_claims: [],
        reasoning: 'Hallucination check failed'
      },
      finalResponse: state.generatedResponse,
      needsRegeneration: false,
      messages: [...state.messages, new AIMessage('Hallucination check failed - accepting response')]
    };
  }
}

/**
 * Response Regeneration Node (for hallucination mitigation)
 */
async function responseRegenerationNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('🔄 StateGraph Node: Response Regeneration');
  
  try {
    const llmConfig = getLlmConfig();
    let llm;
    
    if (llmConfig.defaultProvider === 'openai') {
      llm = new ChatOpenAI({
        modelName: llmConfig.providers.openai.model,
        openAIApiKey: llmConfig.providers.openai.apiKey,
        temperature: 0.1 // Lower temperature for more conservative response
      });
    } else {
      llm = new ChatOllama({
        baseUrl: llmConfig.providers.ollama.baseUrl,
        model: llmConfig.providers.ollama.model,
        temperature: 0.1
      });
    }

    const regenerationPrompt = `The previous response contained potential hallucinations. Generate a new response that is strictly grounded in the provided context.

User Query: "${state.userQuery}"

Context (ONLY use information from here):
${state.ragResults?.context || 'No context available'}

Previous response issues:
${state.hallucinationCheck?.unsupported_claims.join(', ') || 'Potential hallucination detected'}

Instructions:
1. ONLY use information explicitly stated in the context
2. If the context doesn't contain enough information, say so clearly
3. Do not make assumptions or add external knowledge
4. Cite specific sources when making claims
5. Be conservative and acknowledge limitations

Generate a strictly grounded response:`;

    const response = await llm.invoke(regenerationPrompt);
    const regeneratedResponse = response.content.toString().trim();
    
    console.log('✅ Response successfully regenerated');
    
    return {
      finalResponse: regeneratedResponse,
      messages: [...state.messages, new AIMessage('Response regenerated to avoid hallucinations')]
    };
  } catch (error) {
    console.error('❌ Response regeneration failed:', error);
    // Fallback to a safe response
    const safeResponse = `I apologize, but I cannot provide a confident answer based solely on the available information. The documents provided may not contain sufficient details to fully address your question: "${state.userQuery}". Please provide more specific documents or rephrase your question.`;
    
    return {
      finalResponse: safeResponse,
      messages: [...state.messages, new AIMessage('Response regeneration failed - using safe fallback')]
    };
  }
}

/**
 * Database Save Node
 */
async function databaseSaveNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('💾 StateGraph Node: Database Save');
  
  try {
    await databaseService.saveChatHistory(
      state.userQuery,
      state.finalResponse || 'No response generated'
    );
    
    console.log('✅ Chat history saved successfully');
    return {
      messages: [...state.messages, new AIMessage('Chat history saved')]
    };
  } catch (error) {
    console.error('❌ Failed to save chat history:', error);
    return {
      error: 'Failed to save chat history',
      messages: [...state.messages, new AIMessage('Failed to save chat history')]
    };
  }
}

// Conditional functions for routing
function shouldExecuteRAG(state: AgentStateType): string {
  return state.needsDocumentSearch ? 'rag_search' : 'mcp_tools';
}

function shouldExecuteMCP(state: AgentStateType): string {
  return state.needsExternalData ? 'mcp_tools' : 'response_generation';
}

function shouldRegenerateResponse(state: AgentStateType): string {
  return state.needsRegeneration ? 'response_regeneration' : 'database_save';
}

/**
 * Build Enhanced StateGraph workflow
 */
function buildEnhancedStateGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode('intent_analysis', intentAnalysisNode)
    .addNode('rag_search', enhancedRagSearchNode)
    .addNode('mcp_tools', mcpToolsNode)
    .addNode('response_generation', enhancedResponseGenerationNode)
    .addNode('hallucination_detection', hallucinationDetectionNode)
    .addNode('response_regeneration', responseRegenerationNode)
    .addNode('database_save', databaseSaveNode);

  // Enhanced workflow with hallucination detection
  workflow.addEdge(START, 'intent_analysis');
  
  // Conditional routing from intent analysis
  workflow.addConditionalEdges(
    'intent_analysis',
    shouldExecuteRAG,
    {
      'rag_search': 'rag_search',
      'mcp_tools': 'mcp_tools'
    }
  );
  
  // From RAG search, conditionally go to MCP tools
  workflow.addConditionalEdges(
    'rag_search',
    shouldExecuteMCP,
    {
      'mcp_tools': 'mcp_tools',
      'response_generation': 'response_generation'
    }
  );
  
  // From MCP tools, go to response generation
  workflow.addEdge('mcp_tools', 'response_generation');
  
  // From response generation, go to hallucination detection
  workflow.addEdge('response_generation', 'hallucination_detection');
  
  // Conditional routing from hallucination detection
  workflow.addConditionalEdges(
    'hallucination_detection',
    shouldRegenerateResponse,
    {
      'response_regeneration': 'response_regeneration',
      'database_save': 'database_save'
    }
  );
  
  // From response regeneration, go to database save
  workflow.addEdge('response_regeneration', 'database_save');
  
  // End workflow after database save
  workflow.addEdge('database_save', END);

  return workflow;
}

/**
 * Execute Enhanced StateGraph workflow
 */
async function executeEnhancedWorkflow(initialState: AgentStateType): Promise<AgentStateType> {
  try {
    console.log('🚀 Starting enhanced StateGraph workflow execution');
    const workflow = buildEnhancedStateGraph();
    const compiled = workflow.compile();
    
    const finalState = await compiled.invoke(initialState);
    console.log('✅ Enhanced StateGraph workflow completed successfully');
    
    return finalState;
  } catch (error) {
    console.error('❌ Enhanced StateGraph workflow execution failed:', error);
    throw error;
  }
}

/**
 * Main enhanced processing function
 */
async function processQueryEnhanced(userQuery: string): Promise<string> {
  console.log('🚀 Starting Enhanced LangGraph StateGraph Agent Workflow for query:', userQuery);
  
  try {
    const initialState: AgentStateType = {
      messages: [new HumanMessage(userQuery)],
      userQuery,
      transformedQuery: '',
      intent: '',
      needsExternalData: false,
      needsDocumentSearch: true,
      ragResults: undefined,
      mcpResults: undefined,
      generatedResponse: undefined,
      hallucinationCheck: undefined,
      finalResponse: undefined,
      needsRegeneration: false,
      error: undefined
    };

    const finalState = await executeEnhancedWorkflow(initialState);

    console.log('✅ Enhanced LangGraph StateGraph workflow completed successfully');
    return finalState.finalResponse || 'No response generated';

  } catch (error) {
    console.error('❌ Enhanced LangGraph StateGraph workflow failed:', error);
    const errorResponse = 'I apologize, but I encountered an error while processing your request. Please try again.';
    
    try {
      await databaseService.saveChatHistory(userQuery, errorResponse);
    } catch (dbError) {
      console.error('Failed to save error to database:', dbError);
    }
    
    return errorResponse;
  }
}

// Export the enhanced service
const enhancedLangGraphAgentService = {
  processQuery: processQueryEnhanced
};

export default enhancedLangGraphAgentService;
