// Agent service with integrated RAG, LLM, and MCP tools for complete agentic flow
import getMCPRouter from './newLlmRouter.js';
import mcpLlmService from './mcpLlmService.js';
import databaseService from './databaseService.js';
import mcpService from './mcpService.js';
import ragService from './ragService.js';
import axios from 'axios';
import config from '../config/config.js';

// Type definitions
interface IntentAnalysis {
  intent: string;
  dataNeeded: string[];
  reasoning: string;
}

interface AgentResponse {
  response: string;
  intent: string;
  dataUsed: string[];
}

/**
 * Analyzes user input to determine intent and what data is needed
 */
async function analyzeIntent(userQuery: string): Promise<IntentAnalysis> {
  console.log('🔍 Analyzing user intent...');
  const text = userQuery.toLowerCase();

  const containsAny = (parts: string[]) => parts.some((p) => text.includes(p));

  let intent: IntentAnalysis['intent'] = 'general';
  const dataNeeded: string[] = [];
  let reasoning = 'Heuristic classification based on keywords';

  if (containsAny(['status', 'progress', 'update'])) {
    intent = 'status_check';
    dataNeeded.push('jira', 'notion', 'calendar');
  } else if (containsAny(['task', 'todo', 'assign', 'complete', 'bug'])) {
    intent = 'task_management';
    dataNeeded.push('jira', 'notion');
  } else if (containsAny(['calendar', 'meeting', 'schedule', 'event'])) {
    intent = 'calendar_query';
    dataNeeded.push('calendar');
  } else if (containsAny(['project', 'milestone', 'roadmap'])) {
    intent = 'project_overview';
    dataNeeded.push('notion', 'jira');
  }

  return { intent, dataNeeded, reasoning };
}

/**
 * Fetches data using MCP tools and RAG with graceful fallback to LLM agent knowledge
 */
async function fetchData(dataNeeded: string[], userQuery?: string): Promise<Record<string, any>> {
  console.log('📊 Fetching data using MCP tools and RAG for:', dataNeeded);
  
  const fetchedData: Record<string, any> = {};
  let mcpAvailable = false;
  
  // Check RAG service availability
  const ragStatus = await ragService.getStatus();
  fetchedData.ragServiceStatus = ragStatus;
  
  // Perform RAG search if service is ready
  if (userQuery && ragStatus.ready) {
    console.log('🔍 RAG service is available, performing document search');
    try {
      const ragResults = await ragService.searchRelevantChunks(userQuery, 5);
      fetchedData.ragResults = {
        chunks: ragResults.chunks,
        context: ragResults.context, 
        sources: ragResults.sources,
        found: ragResults.chunks.length
      };
      console.log(`✅ RAG search completed, found ${ragResults.chunks.length} relevant chunks`);
    } catch (ragError) {
      console.error('❌ RAG search failed:', ragError);
      fetchedData.ragResults = { 
        chunks: [], 
        context: '', 
        sources: [], 
        found: 0,
        error: 'Document search failed'
      };
    }
  } else if (userQuery && !ragStatus.ready) {
    console.log('⚠️ RAG service not available, skipping document search');
    fetchedData.ragResults = { 
      chunks: [], 
      context: '', 
      sources: [], 
      found: 0,
      error: 'Document search service unavailable'
    };
  }
  
  try {
    // Initialize MCP service if not ready
    if (!mcpService.isReady()) {
      console.log('🔄 Initializing MCP service...');
      await mcpService.initialize();
    }
    
    // Get MCP service status
    const mcpStatus = await mcpService.getServerStatus();
    fetchedData.mcpServiceStatus = mcpStatus;
    
    // Check if any MCP servers are available
    mcpAvailable = Boolean(mcpStatus.notion || mcpStatus.jira || mcpStatus.calendar);
    
    if (mcpAvailable) {
      console.log('✅ MCP servers available, using MCP tools');
      
      // Use MCP agent to execute tools when available
      const mcpAgent = mcpService.getAgent();
      
      if (mcpAgent && userQuery) {
        console.log('🤖 Using MCP agent to execute tools based on user query');
        try {
          const availableSources = Object.entries(mcpStatus)
            .filter(([_, status]) => status)
            .map(([source, _]) => source);
            
          const mcpResponse = await mcpService.runQuery(
            `Based on this user query: "${userQuery}", use available MCP tools to gather relevant information from ${dataNeeded.join(', ')} sources. Available configured sources: ${availableSources.join(', ')}`
          );
          
          fetchedData.mcpResponse = mcpResponse;
          fetchedData.mcpToolsUsed = true;
          console.log('✅ MCP agent executed successfully');
        } catch (mcpError) {
          console.error('❌ MCP agent execution failed:', mcpError);
          fetchedData.mcpResponse = 'MCP agent execution failed';
          fetchedData.mcpToolsUsed = false;
          fetchedData.mcpError = (mcpError as Error).message;
        }
      } else {
        console.log('⚠️ MCP agent not available - tools cannot be executed');
        fetchedData.mcpResponse = 'MCP agent not initialized. Tools available but cannot be executed without agent.';
        fetchedData.mcpToolsUsed = false;
      }
    }
  } catch (error) {
    console.warn('⚠️ MCP service error, falling back to LLM agent:', error);
    mcpAvailable = false;
  }
  
  // If no MCP servers available, set simple fallback mode
  if (!mcpAvailable) {
    console.log('🤖 MCP tools not available, using LLM agent with knowledge base');
    fetchedData.mcpFallback = true;
    fetchedData.mcpErrorMessage = 'External integration tools are currently unavailable.';
    
    // Set empty data arrays but indicate fallback mode
    for (const source of dataNeeded) {
      switch (source.toLowerCase()) {
        case 'jira':
          fetchedData.jiraTasks = [];
          fetchedData.jiraStatus = 'Using LLM knowledge base';
          break;
        case 'notion':
          fetchedData.notionPages = [];
          fetchedData.notionStatus = 'Using LLM knowledge base';
          break;
        case 'calendar':
          fetchedData.calendarEvents = [];
          fetchedData.calendarStatus = 'Using LLM knowledge base';
          break;
      }
    }
  }
  
  return fetchedData;
}

/**
 * Generates a response using the LLM based on the fetched data
 */
async function generateResponse(userQuery: string, intent: string, fetchedData: Record<string, any>): Promise<string> {
  let context = 'Based on the current data:\n\n';
  
  // Add RAG service status and results
  if (fetchedData.ragServiceStatus) {
    const ragStatus = fetchedData.ragServiceStatus;
    context += 'Document Search (RAG) Status:\n';
    context += `- Vector Database: ${ragStatus.vectorDB ? '✅ Available' : '❌ Unavailable'}\n`;
    context += `- Embedding Service: ${ragStatus.embeddingService ? '✅ Available' : '❌ Unavailable'}\n`;
    
    if (fetchedData.ragResults) {
      const ragResults = fetchedData.ragResults;
      if (ragResults.found > 0) {
        context += `- Found ${ragResults.found} relevant document chunks\n\n`;
        context += 'Relevant Document Context:\n';
        context += ragResults.context + '\n\n';
      } else {
        context += '- No relevant documents found\n\n';
      }
    }
  }
  
  // Handle graceful fallback mode
  if (fetchedData.mcpFallback) {
    context += `⚠️ ${fetchedData.mcpErrorMessage}\n\n`;
    context += 'Operating in fallback mode using LLM knowledge base and RAG functionality.\n\n';
  } else {
    // Add MCP service status information
    if (fetchedData.mcpServiceStatus) {
      const status = fetchedData.mcpServiceStatus;
      context += 'MCP Integration Status:\n';
      context += `- Notion MCP: ${status.notion ? '✅ Connected' : '❌ Disconnected'}\n`;
      context += `- Jira MCP: ${status.jira ? '✅ Connected' : '❌ Disconnected'}\n`;
      context += `- Google Calendar MCP: ${status.calendar ? '✅ Connected' : '❌ Disconnected'}\n\n`;
    }
    
    // Add available MCP tools information
    if (fetchedData.mcpJiraToolsAvailable) {
      context += `Available Jira MCP Tools: ${fetchedData.mcpJiraToolsAvailable.join(', ')}\n`;
    }
    if (fetchedData.mcpNotionToolsAvailable) {
      context += `Available Notion MCP Tools: ${fetchedData.mcpNotionToolsAvailable.join(', ')}\n`;
    }
    if (fetchedData.mcpCalendarToolsAvailable) {
      context += `Available Calendar MCP Tools: ${fetchedData.mcpCalendarToolsAvailable.join(', ')}\n`;
    }
  }
  
  // Add fetched data context
  Object.entries(fetchedData).forEach(([key, value]) => {
    if (key !== 'mcpServiceStatus' && 
        key !== 'mcpFallback' && 
        key !== 'mcpErrorMessage' && 
        !key.includes('mcpToolsAvailable') && 
        value !== null && 
        value !== undefined) {
      if (Array.isArray(value) && value.length > 0) {
        context += `${key}: ${JSON.stringify(value, null, 2)}\n`;
      } else if (typeof value === 'string' && value.length > 0) {
        context += `${key}: ${value}\n`;
      }
    }
  });
  
  if (context === 'Based on the current data:\n\n') {
    context += 'No specific data available.\n';
  }
  
  context += '\n';
  
  // Different prompts based on MCP availability
  let responsePrompt: string;
  
  if (fetchedData.mcpFallback) {
    responsePrompt = `You are an AI assistant for task and project management with integrated document search capabilities. External integration tools are currently unavailable, but you can still provide comprehensive help.
  
User Query: "${userQuery}"
Intent: ${intent}

${context}

You have access to:
1. Your extensive knowledge about task management, project planning, and productivity
2. Relevant information from uploaded documents (if any were found above)
3. Best practices and actionable recommendations

Provide a helpful, comprehensive response that:
- Uses any relevant document context found above
- Draws from your knowledge base for additional insights
- Offers practical, actionable advice
- Briefly mentions that external tools are unavailable but emphasizes the value you can still provide

Focus on being genuinely helpful and informative.`;
  } else {
    responsePrompt = `You are an AI assistant for task and project management with full access to integrated tools and document search.
  
User Query: "${userQuery}"
Intent: ${intent}

${context}

You have access to:
1. Document search results (RAG) from uploaded PDFs and files
2. MCP integration tools for Notion, Jira, and Google Calendar
3. Your comprehensive knowledge base

Provide a helpful, comprehensive response that:
- Prioritizes information from relevant documents found above
- Uses available MCP tool data and status information
- Supplements with your knowledge base as needed
- Offers practical, actionable advice
- Mentions tool availability and suggests next steps when appropriate

Be thorough and provide maximum value by combining all available information sources.`;
  }
  
  try {
    // If MCP tools are unavailable, use a direct local LLM fallback for speed
    if (fetchedData.mcpFallback) {
      const baseUrl = config.get('llm.ollama.baseUrl');
      const model = 'mistral:latest';
      const resp = await axios.post(`${baseUrl}/api/generate`, {
        model,
        prompt: responsePrompt,
        stream: false
      }, { timeout: 30_000 });
      const text: string = resp.data?.response || '';
      return text || 'No response generated.';
    }

    // Otherwise, use the MCP-aware LLM service with timeout
    if (!mcpLlmService.isInitialized()) {
      await mcpLlmService.initialize();
    }

    const response = await Promise.race([
      mcpLlmService.complete(responsePrompt, {
        temperature: 0.7,
        maxTokens: 600
      }),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('LLM completion timed out after 40 seconds')), 40_000))
    ]);
    return response as string;
  } catch (error) {
    console.error('Error generating response:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return 'I apologize, but I encountered an error while generating a response. Please try again.';
  }
}

/**
 * Main function to process user queries with integrated RAG, MCP, and agent capabilities
 */
async function processQuery(userQuery: string): Promise<string> {
  try {
    console.log('🚀 Processing user query with integrated RAG/MCP/Agent flow:', userQuery);
    
    // Step 1: Analyze intent
    const intent = await analyzeIntent(userQuery);
    console.log('🎯 Intent analysis:', intent);
    
    // Step 2: Fetch relevant data (including RAG search) based on intent
    const fetchedData = await fetchData(intent.dataNeeded, userQuery);
    
    // Step 3: Generate response using LLM with RAG context and MCP data
    const response = await generateResponse(userQuery, intent.intent, fetchedData);
    
    // Step 4: Save to database
    await databaseService.saveChatHistory(userQuery, response);
    
    return response;
  } catch (error) {
    console.error('❌ Error processing query:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    const errorResponse = 'I apologize, but I encountered an error while processing your request. Please try again.';
    
    // Still try to save the error case
    try {
      await databaseService.saveChatHistory(userQuery, errorResponse);
    } catch (dbError) {
      console.error('Failed to save error to database:', dbError);
    }
    
    return errorResponse;
  }
}

// Export the main function
const agentService = {
  processQuery
};

export default agentService;
