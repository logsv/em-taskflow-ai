import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import llmService from './llmService.js';
import taskManager from './taskManager.js';
import axios from 'axios';
import databaseService from './databaseService.js';

/**
 * Represents the agent's working state
 */
class AgentState {
  constructor() {
    this.messages = [];
    this.userQuery = '';
    this.intent = '';
    this.context = {};
    this.response = '';
    this.dataNeeded = [];
    this.fetchedData = {};
  }
}

/**
 * Analyzes user input to determine intent and what data is needed
 */
async function analyzeIntent(state) {
  console.log('🔍 Analyzing user intent...');
  
  const intentPrompt = `Analyze this user query and determine:
1. Intent category: 'status_check', 'task_management', 'calendar_query', 'project_overview', 'general'
2. Data sources needed: 'jira', 'notion', 'calendar', 'google', 'atlassian', or combinations

User Query: "${state.userQuery}"

Respond in JSON format:
{
  "intent": "category",
  "dataNeeded": ["source1", "source2"],
  "reasoning": "brief explanation"
}`;

  try {
    const intentResponse = await llmService.complete(intentPrompt, { maxTokens: 200 });
    const intentData = JSON.parse(intentResponse);
    
    state.intent = intentData.intent;
    state.dataNeeded = intentData.dataNeeded;
    
    console.log(`📊 Intent: ${state.intent}, Data needed: ${state.dataNeeded.join(', ')}`);
    return state;
  } catch (error) {
    console.error('Error analyzing intent:', error);
    // Fallback: fetch all data
    state.intent = 'general';
    state.dataNeeded = ['jira', 'notion', 'calendar', 'google', 'atlassian'];
    return state;
  }
}

/**
 * Conditionally fetches only the data that's needed based on intent
 */
async function fetchRelevantData(state) {
  console.log('📥 Fetching relevant data...');
  
  const fetchPromises = [];
  const dataKeys = [];
  
  // Only fetch data that's actually needed
  if (state.dataNeeded.includes('jira')) {
    fetchPromises.push(taskManager.fetchAssignedTasks());
    dataKeys.push('jiraTasks');
  }
  
  if (state.dataNeeded.includes('notion')) {
    fetchPromises.push(taskManager.fetchProjectPages());
    dataKeys.push('notionPages');
  }
  
  if (state.dataNeeded.includes('calendar')) {
    fetchPromises.push(taskManager.fetchTodaysEvents());
    dataKeys.push('calendarEvents');
  }

  if (state.dataNeeded.includes('google')) {
    fetchPromises.push(axios.post('http://localhost:3001/proxy', {
      toolId: 'google-calendar',
      inputs: {
        toolName: 'get-upcoming-events',
        parameters: {
          days: 7
        }
      }
    }));
    dataKeys.push('google');
  }

  if (state.dataNeeded.includes('atlassian')) {
    fetchPromises.push(axios.post('http://localhost:3002/proxy', {
      toolId: 'jira',
      inputs: {
        toolName: 'get-assigned-issues',
        parameters: {}
      }
    }));
    dataKeys.push('atlassian');
  }
  
  try {
    const results = await Promise.all(fetchPromises);
    
    // Map results to data keys
    results.forEach((result, index) => {
      state.fetchedData[dataKeys[index]] = result.data ? result.data.output : result;
    });
    
    // Detect calendar conflicts if calendar data was fetched
    if (state.fetchedData.calendarEvents) {
      state.fetchedData.calendarConflicts = taskManager.detectConflicts(state.fetchedData.calendarEvents);
    }
    
    console.log(`✅ Fetched data for: ${dataKeys.join(', ')}`);
    return state;
  } catch (error) {
    console.error('Error fetching data:', error);
    state.fetchedData = {};
    return state;
  }
}

/**
 * Formats the fetched data into context for LLM
 */
async function formatContext(state) {
  console.log('📝 Formatting context...');
  
  let context = '';
  
  // Format Jira data if available
  if (state.fetchedData.jiraTasks && state.fetchedData.jiraTasks.length > 0) {
    context += 'JIRA TASKS:\n';
    state.fetchedData.jiraTasks.forEach(task => {
      context += `• [${task.key}] ${task.summary} - Status: ${task.status}\n`;
    });
    context += '\n';
  }
  
  // Format Notion data if available
  if (state.fetchedData.notionPages && state.fetchedData.notionPages.length > 0) {
    context += 'NOTION PROJECTS:\n';
    state.fetchedData.notionPages.forEach(page => {
      context += `• ${page.title} (Last updated: ${page.last_edited_time})\n`;
    });
    context += '\n';
  }
  
  // Format Calendar data if available
  if (state.fetchedData.calendarEvents && state.fetchedData.calendarEvents.length > 0) {
    context += 'TODAY\'S CALENDAR:\n';
    state.fetchedData.calendarEvents.forEach(event => {
      context += `• ${event.summary} (${event.start} - ${event.end})\n`;
    });
    context += '\n';
  }
  
  // Format conflicts if available
  if (state.fetchedData.calendarConflicts && state.fetchedData.calendarConflicts.length > 0) {
    context += 'SCHEDULING CONFLICTS:\n';
    state.fetchedData.calendarConflicts.forEach(([a, b]) => {
      context += `• "${a.summary}" conflicts with "${b.summary}"\n`;
    });
    context += '\n';
  }

  // Format Google data if available
  if (state.fetchedData.google) {
    context += 'GOOGLE CALENDAR (next 7 days):\n';
    context += JSON.stringify(state.fetchedData.google, null, 2);
    context += '\n';
  }

  // Format Atlassian data if available
  if (state.fetchedData.atlassian) {
    context += 'ATLASSIAN (Jira):\n';
    context += JSON.stringify(state.fetchedData.atlassian, null, 2);
    context += '\n';
  }
  
  state.context = context;
  return state;
}

/**
 * Generates the final AI response using the formatted context
 */
async function generateResponse(state) {
  console.log('🤖 Generating AI response...');
  
  // Format previous messages for context if available
  let conversationHistory = '';
  if (state.messages && state.messages.length > 0) {
    // Only use the latest 5 messages for context
    const recentMessages = state.messages.slice(-10); // Get last 10 items (5 exchanges)
    
    conversationHistory = '\nPrevious conversation:\n';
    for (let i = 0; i < recentMessages.length; i++) {
      const message = recentMessages[i];
      const role = message._getType() === 'human' ? 'User' : 'Assistant';
      conversationHistory += `${role}: ${message.content}\n`;
    }
  }
  
  const prompt = `You are an intelligent productivity assistant for EM TaskFlow. You have access to the user's current tasks, projects, and calendar.

${state.context}${conversationHistory}

User Question: ${state.userQuery}

Provide a helpful, concise response based on the available data. Focus on actionable insights and priorities. If the user asks about specific tasks or wants suggestions, reference the actual data above.`;
  
  try {
    const aiResponse = await llmService.complete(prompt, { maxTokens: 512 });
    state.response = aiResponse;
    
    // Add messages for conversation history
    state.messages.push(new HumanMessage(state.userQuery));
    state.messages.push(new AIMessage(state.response));
    
    console.log('✅ Response generated successfully');
    return state;
  } catch (error) {
    console.error('Error generating response:', error);
    state.response = 'I apologize, but I encountered an error while processing your request. Please try again.';
    return state;
  }
}

/**
 * Determines if we should end the workflow
 */
function shouldEnd(state) {
  return state.response ? END : 'generateResponse';
}

/**
 * Creates and configures the LangGraph workflow
 */
function createAgentWorkflow() {
  const workflow = new StateGraph({
    channels: {
      messages: {
        value: (prev, curr) => prev.concat(curr),
        default: () => []
      },
      userQuery: {
        value: (prev, curr) => curr || prev,
        default: () => ''
      },
      intent: {
        value: (prev, curr) => curr || prev,
        default: () => ''
      },
      context: {
        value: (prev, curr) => curr || prev,
        default: () => ''
      },
      response: {
        value: (prev, curr) => curr || prev,
        default: () => ''
      },
      dataNeeded: {
        value: (prev, curr) => curr || prev,
        default: () => []
      },
      fetchedData: {
        value: (prev, curr) => ({ ...prev, ...curr }),
        default: () => ({})
      }
    }
  });

  // Add nodes
  workflow.addNode('analyzeIntent', analyzeIntent);
  workflow.addNode('fetchRelevantData', fetchRelevantData);
  workflow.addNode('formatContext', formatContext);
  workflow.addNode('generateResponse', generateResponse);

  // Define the flow
  workflow.addEdge(START, 'analyzeIntent');
  workflow.addEdge('analyzeIntent', 'fetchRelevantData');
  workflow.addEdge('fetchRelevantData', 'formatContext');
  workflow.addEdge('formatContext', 'generateResponse');
  workflow.addConditionalEdges('generateResponse', shouldEnd);

  return workflow.compile();
}

/**
 * Main function to process user queries using the LangGraph agent
 */
async function processUserQuery(userInput, sessionId = null) {
  console.log('🚀 Starting LangGraph agent workflow...');
  
  try {
    const agent = createAgentWorkflow();
    
    // Get the latest 5 messages from chat history if sessionId is provided
    let previousMessages = [];
    if (sessionId) {
      try {
        const databaseService = require('./databaseService');
        const chatHistory = await databaseService.getChatHistory(5, sessionId);
        
        // Convert to LangChain message format
        previousMessages = chatHistory.flatMap(entry => [
          new HumanMessage(entry.user_message),
          new AIMessage(entry.ai_response)
        ]);
        
        console.log(`📜 Retrieved ${previousMessages.length / 2} previous conversations for context`);
      } catch (dbError) {
        console.warn('Failed to retrieve chat history:', dbError);
      }
    }
    
    // Initialize state
    const initialState = {
      userQuery: userInput,
      messages: previousMessages,
      intent: '',
      context: '',
      response: '',
      dataNeeded: [],
      fetchedData: {}
    };
    
    // Run the workflow
    const finalState = await agent.invoke(initialState);
    
    console.log('🎉 LangGraph workflow completed successfully');
    return finalState.response;
  } catch (error) {
    console.error('Error in LangGraph agent workflow:', error);
    // Fallback to original behavior
    console.log('🔄 Falling back to original processing...');
    const data = await taskManager.fetchAllStatus();
    const contextSummary = await formatDataForLLM(data);
    
    const prompt = `You are an intelligent productivity assistant for EM TaskFlow. You have access to the user's current tasks, projects, and calendar.

${contextSummary}

User Question: ${userInput}

Provide a helpful, concise response based on the user's current workload. Focus on actionable insights and priorities.`;
    
    return await llmService.complete(prompt, { maxTokens: 512 });
  }
}

/**
 * Legacy function for compatibility (formats data the old way)
 */
async function formatDataForLLM(data) {
  const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = data;
  
  let summary = 'Current Status Overview:\n\n';
  
  if (jiraTasks && jiraTasks.length > 0) {
    summary += 'JIRA TASKS:\n';
    jiraTasks.forEach(task => {
      summary += `• [${task.key}] ${task.summary} - Status: ${task.status}\n`;
    });
    summary += '\n';
  }
  
  if (notionPages && notionPages.length > 0) {
    summary += 'NOTION PROJECTS:\n';
    notionPages.forEach(page => {
      summary += `• ${page.title} (Last updated: ${page.last_edited_time})\n`;
    });
    summary += '\n';
  }
  
  if (calendarEvents && calendarEvents.length > 0) {
    summary += 'TODAY\'S CALENDAR:\n';
    calendarEvents.forEach(event => {
      summary += `• ${event.summary} (${event.start} - ${event.end})\n`;
    });
    summary += '\n';
  }
  
  if (calendarConflicts && calendarConflicts.length > 0) {
    summary += 'SCHEDULING CONFLICTS:\n';
    calendarConflicts.forEach(([a, b]) => {
      summary += `• "${a.summary}" conflicts with "${b.summary}"\n`;
    });
    summary += '\n';
  }
  
  return summary;
}

/**
 * Generates smart priority suggestions based on current workload
 */
async function generateSmartSuggestions(sessionId = null) {
  console.log('💡 Generating smart suggestions with LangGraph...');
  
  try {
    // Use the agent to get suggestions
    const suggestionsQuery = 'What are the top 3 priority items I should focus on today? Please analyze my current workload and provide specific, actionable recommendations.';
    
    // Pass sessionId to use chat history for context
    const suggestions = await processUserQuery(suggestionsQuery, sessionId);
    return suggestions;
  } catch (error) {
    console.error('Error generating suggestions:', error);
    // Fallback to original method
    console.log('🔄 Falling back to original suggestions method...');
    const data = await taskManager.fetchAllStatus();
    const contextSummary = await formatDataForLLM(data);
    
    // Try to get recent chat history for additional context
    let conversationContext = '';
    if (sessionId) {
      try {
        const databaseService = require('./databaseService');
        const chatHistory = await databaseService.getChatHistory(5, sessionId);
        
        if (chatHistory && chatHistory.length > 0) {
          conversationContext = '\nRecent conversation history:\n';
          chatHistory.forEach(entry => {
            conversationContext += `User: ${entry.user_message}\nAssistant: ${entry.ai_response}\n`;
          });
        }
      } catch (dbError) {
        console.warn('Failed to retrieve chat history for suggestions:', dbError);
      }
    }
    
    const prompt = `You are a productivity expert analyzing someone's current workload. Based on the following information, provide the top 3 priority items they should focus on today.

${contextSummary}${conversationContext}

Respond with actionable priorities in a numbered list format. Be specific and reference actual tasks/meetings when possible.`;
    
    return await llmService.complete(prompt, { maxTokens: 256 });
  }
}

export { processUserQuery, formatDataForLLM, generateSmartSuggestions };