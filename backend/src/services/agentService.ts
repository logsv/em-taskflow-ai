// Agent service with integrated RAG, LLM, and MCP tools for complete agentic flow
import enhancedLlmService from './enhancedLlmService.js';
import databaseService from './databaseService.js';
import mcpService from './mcpService.js';
import ragService from './ragService.js';

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
  
  const intentPrompt = `Analyze this user query and determine:
1. Intent category: 'status_check', 'task_management', 'calendar_query', 'project_overview', 'general'
2. Data sources needed: 'jira', 'notion', 'calendar', 'google', 'atlassian', or combinations

User Query: "${userQuery}"

Respond in JSON format:
{
  "intent": "category",
  "dataNeeded": ["source1", "source2"],
  "reasoning": "brief explanation"
}`;

  try {
    // Initialize enhanced LLM service if not already initialized
    if (!enhancedLlmService.isInitialized()) {
      await enhancedLlmService.initialize();
    }
    
    const response = await enhancedLlmService.complete(intentPrompt, { temperature: 0.3 });
    console.log('Raw intent analysis response:', response);
    
    try {
      const analysis = JSON.parse(response) as IntentAnalysis;
      console.log('Parsed intent analysis:', analysis);
      return analysis;
    } catch (parseError) {
      console.error('Failed to parse intent analysis JSON:', parseError);
      console.error('Raw response was:', response);
      
      // Try to extract basic intent from the response text
      const fallbackIntent = response.toLowerCase().includes('status') ? 'status_check' :
                           response.toLowerCase().includes('task') ? 'task_management' :
                           response.toLowerCase().includes('calendar') ? 'calendar_query' : 'general';
      
      return {
        intent: fallbackIntent,
        dataNeeded: [],
        reasoning: 'Failed to parse JSON response, extracted basic intent from text'
      };
    }
  } catch (error) {
    console.error('Error analyzing intent:', error);
    return {
      intent: 'general',
      dataNeeded: [],
      reasoning: 'Failed to analyze intent, defaulting to general'
    };
  }
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
      
      // Get all available MCP tools
      const mcpTools = await mcpService.getTools();
      console.log('🛠️ Available MCP tools:', mcpTools.map(tool => tool.name));
      
      // Use MCP agent to execute tools when available
      const mcpAgent = mcpService.getAgent();
      
      if (mcpAgent && userQuery) {
        console.log('🤖 Using MCP agent to execute tools based on user query');
        try {
          const mcpResponse = await mcpService.runQuery(
            `Based on this user query: "${userQuery}", use available MCP tools to gather relevant information from ${dataNeeded.join(', ')} sources.`
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
        console.log('⚠️ MCP agent not available, logging available tools only');
        
        for (const source of dataNeeded) {
          switch (source.toLowerCase()) {
            case 'jira':
              if (mcpStatus.jira) {
                const jiraTools = await mcpService.getToolsByServer('jira');
                fetchedData.mcpJiraToolsAvailable = jiraTools.map(t => t.server || 'jira');
              }
              break;
              
            case 'notion':
              if (mcpStatus.notion) {
                const notionTools = await mcpService.getToolsByServer('notion');
                fetchedData.mcpNotionToolsAvailable = notionTools.map(t => t.server || 'notion');
              }
              break;
              
            case 'calendar':
              if (mcpStatus.calendar) {
                const calendarTools = await mcpService.getToolsByServer('calendar');
                fetchedData.mcpCalendarToolsAvailable = calendarTools.map(t => t.server || 'calendar');
              }
              break;
          }
        }
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
    // Initialize enhanced LLM service if not already initialized
    if (!enhancedLlmService.isInitialized()) {
      await enhancedLlmService.initialize();
    }
    
    const response = await enhancedLlmService.complete(responsePrompt, {
      temperature: 0.7,
      maxTokens: 600
    });
    return response;
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
