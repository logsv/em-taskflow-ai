// Simplified agent service without complex LangGraph types
import llmService from './llmService.js';
import taskManager from './taskManager.js';
import databaseService from './databaseService.js';

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
    const response = await llmService.complete(intentPrompt, { temperature: 0.3 });
    const analysis = JSON.parse(response) as IntentAnalysis;
    console.log('Intent analysis:', analysis);
    return analysis;
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
 * Fetches data based on the analyzed intent
 */
async function fetchData(dataNeeded: string[]): Promise<Record<string, any>> {
  console.log('📊 Fetching data for:', dataNeeded);
  
  const fetchedData: Record<string, any> = {};
  
  for (const source of dataNeeded) {
    try {
      switch (source.toLowerCase()) {
        case 'jira':
          fetchedData.jiraTasks = await taskManager.fetchAssignedTasks();
          break;
        case 'notion':
          fetchedData.notionPages = await taskManager.fetchProjectPages();
          break;
        case 'calendar':
          fetchedData.calendarEvents = await taskManager.fetchTodaysEvents();
          const events = fetchedData.calendarEvents || [];
          fetchedData.calendarConflicts = taskManager.detectConflicts(events);
          break;
        default:
          console.warn(`Unknown data source: ${source}`);
      }
    } catch (error) {
      console.error(`Error fetching ${source} data:`, error);
      fetchedData[source] = null;
    }
  }
  
  return fetchedData;
}

/**
 * Generates a response based on the user query and fetched data
 */
async function generateResponse(userQuery: string, intent: string, fetchedData: Record<string, any>): Promise<string> {
  console.log('🤖 Generating response...');
  
  // Format the data for the LLM
  let contextString = 'Available data:\n';
  
  if (fetchedData.jiraTasks) {
    contextString += `\nJIRA Tasks:\n${JSON.stringify(fetchedData.jiraTasks, null, 2)}`;
  }
  
  if (fetchedData.notionPages) {
    contextString += `\nNotion Pages:\n${JSON.stringify(fetchedData.notionPages, null, 2)}`;
  }
  
  if (fetchedData.calendarEvents) {
    contextString += `\nCalendar Events:\n${JSON.stringify(fetchedData.calendarEvents, null, 2)}`;
  }
  
  if (fetchedData.calendarConflicts) {
    contextString += `\nCalendar Conflicts:\n${JSON.stringify(fetchedData.calendarConflicts, null, 2)}`;
  }
  
  const responsePrompt = `You are a helpful AI assistant that helps users manage their tasks and projects.

User Query: "${userQuery}"
Intent: ${intent}

${contextString}

Please provide a helpful, concise response based on the available data. If no relevant data is available, provide general guidance.`;

  try {
    const response = await llmService.complete(responsePrompt, { 
      temperature: 0.7,
      max_tokens: 500 
    });
    return response;
  } catch (error) {
    console.error('Error generating response:', error);
    return 'I apologize, but I encountered an error while processing your request. Please try again.';
  }
}

/**
 * Main agent processing function
 */
async function processQuery(userQuery: string): Promise<AgentResponse> {
  console.log('🚀 Processing query:', userQuery);
  
  try {
    // Step 1: Analyze intent
    const analysis = await analyzeIntent(userQuery);
    
    // Step 2: Fetch required data
    const fetchedData = await fetchData(analysis.dataNeeded);
    
    // Step 3: Generate response
    const response = await generateResponse(userQuery, analysis.intent, fetchedData);
    
    // Step 4: Save to database
    await databaseService.saveChatHistory(userQuery, response);
    
    return {
      response,
      intent: analysis.intent,
      dataUsed: analysis.dataNeeded
    };
  } catch (error) {
    console.error('Error processing query:', error);
    const errorResponse = 'I apologize, but I encountered an error while processing your request. Please try again.';
    
    // Still try to save the error case
    try {
      await databaseService.saveChatHistory(userQuery, errorResponse);
    } catch (dbError) {
      console.error('Error saving to database:', dbError);
    }
    
    return {
      response: errorResponse,
      intent: 'error',
      dataUsed: []
    };
  }
}

// Export the main function
const agentService = {
  processQuery
};

export default agentService;
