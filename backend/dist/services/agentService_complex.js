// Simplified agent service without complex LangGraph types
import llmService from './llmService.ts';
import taskManager from './taskManager.ts';
import databaseService from './databaseService.ts';
/**
 * Analyzes user input to determine intent and what data is needed
 */
async function analyzeIntent(userQuery) {
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
        const intentResponse = await llmService.complete(intentPrompt, { max_tokens: 200 });
        const intentData = JSON.parse(intentResponse);
        state.intent = intentData.intent;
        state.dataNeeded = intentData.dataNeeded;
        console.log(`📊 Intent: ${state.intent}, Data needed: ${state.dataNeeded.join(', ')}`);
        return state;
    }
    catch (error) {
        console.error('Error analyzing intent:', error);
        state.intent = 'general';
        state.dataNeeded = [];
        return state;
    }
}
/**
 * Conditionally fetches only the data that's needed based on intent
 */
async function fetchRelevantData(state) {
    console.log('📥 Fetching relevant data...');
    const fetchPromises = [];
    // Only fetch data that's actually needed
    if (state.dataNeeded.includes('jira')) {
        fetchPromises.push(taskManager.fetchAssignedTasks().then(data => ({ type: 'jira', data })));
    }
    if (state.dataNeeded.includes('notion')) {
        fetchPromises.push(taskManager.fetchProjectPages().then(data => ({ type: 'notion', data })));
    }
    if (state.dataNeeded.includes('calendar')) {
        fetchPromises.push(taskManager.fetchTodaysEvents().then(data => ({ type: 'calendar', data })));
    }
    try {
        const results = await Promise.all(fetchPromises);
        // Organize fetched data by type
        results.forEach(result => {
            state.fetchedData[result.type] = result.data;
        });
        console.log(`✅ Fetched data for: ${Object.keys(state.fetchedData).join(', ')}`);
        return state;
    }
    catch (error) {
        console.error('Error fetching data:', error);
        return state;
    }
}
/**
 * Formats the fetched data into context for LLM
 */
async function formatContext(state) {
    console.log('📝 Formatting context...');
    let contextString = 'Current Status Overview:\n\n';
    // Format Jira tasks if available
    if (state.fetchedData.jira && state.fetchedData.jira.length > 0) {
        contextString += 'JIRA TASKS:\n';
        state.fetchedData.jira.forEach((task) => {
            contextString += `• [${task.key || task.id}] ${task.summary} - Status: ${task.status}\n`;
        });
        contextString += '\n';
    }
    // Format Notion pages if available
    if (state.fetchedData.notion && state.fetchedData.notion.length > 0) {
        contextString += 'NOTION PROJECTS:\n';
        state.fetchedData.notion.forEach((page) => {
            contextString += `• ${page.title} (Last updated: ${page.last_edited_time})\n`;
        });
        contextString += '\n';
    }
    // Format calendar events if available
    if (state.fetchedData.calendar && state.fetchedData.calendar.length > 0) {
        contextString += 'TODAY\'S CALENDAR:\n';
        state.fetchedData.calendar.forEach((event) => {
            contextString += `• ${event.summary} (${event.start} - ${event.end})\n`;
        });
        contextString += '\n';
    }
    state.context.formattedData = contextString;
    return state;
}
/**
 * Generates the final AI response using the formatted context
 */
async function generateResponse(state) {
    console.log('🤖 Generating AI response...');
    const contextData = state.context.formattedData || 'No specific data available.';
    const responsePrompt = `You are an intelligent productivity assistant for EM TaskFlow. You have access to the user's current tasks, projects, and calendar.

${contextData}

User Question: ${state.userQuery}

Provide a helpful, concise response based on the user's current workload. Focus on actionable insights and priorities. If the user asks about specific tasks or wants suggestions, reference the actual data above.`;
    try {
        const aiResponse = await llmService.complete(responsePrompt, { max_tokens: 512 });
        state.response = aiResponse;
        // Add messages to conversation history
        state.messages.push(new HumanMessage(state.userQuery));
        state.messages.push(new AIMessage(state.response));
        console.log('✅ Response generated successfully');
        return state;
    }
    catch (error) {
        console.error('Error generating response:', error);
        state.response = 'I apologize, but I encountered an error while processing your request. Please try again.';
        return state;
    }
}
/**
 * Determines if we should end the workflow
 */
function shouldEnd(state) {
    return state.response ? END : 'generate_response';
}
/**
 * Creates and configures the LangGraph workflow
 */
function createAgentWorkflow() {
    const workflow = new StateGraph({
        channels: {
            messages: [],
            userQuery: '',
            intent: '',
            context: {},
            response: '',
            dataNeeded: [],
            fetchedData: {}
        }
    });
    // Add nodes
    workflow.addNode('analyze_intent', analyzeIntent);
    workflow.addNode('fetch_data', fetchRelevantData);
    workflow.addNode('format_context', formatContext);
    workflow.addNode('generate_response', generateResponse);
    // Add edges
    workflow.addEdge(START, 'analyze_intent');
    workflow.addEdge('analyze_intent', 'fetch_data');
    workflow.addEdge('fetch_data', 'format_context');
    workflow.addEdge('format_context', 'generate_response');
    workflow.addConditionalEdges('generate_response', shouldEnd);
    return workflow;
}
/**
 * Main function to process user queries using the LangGraph agent
 */
async function processUserQuery(userInput, sessionId = null) {
    try {
        console.log(`🚀 Processing query: "${userInput}"`);
        // Create initial state
        const initialState = new AgentState();
        initialState.userQuery = userInput;
        // Create and compile workflow
        const workflow = createAgentWorkflow();
        const app = workflow.compile();
        // Run the workflow
        const finalState = await app.invoke(initialState);
        // Save to database if sessionId provided
        if (sessionId) {
            try {
                await databaseService.saveChatHistory(userInput, finalState.response, sessionId, {
                    intent: finalState.intent,
                    dataNeeded: finalState.dataNeeded,
                    timestamp: new Date().toISOString()
                });
            }
            catch (dbError) {
                console.error('Error saving to database:', dbError);
            }
        }
        console.log('✅ Query processed successfully');
        return finalState.response;
    }
    catch (error) {
        console.error('Error in processUserQuery:', error);
        return 'I apologize, but I encountered an error while processing your request. Please try again.';
    }
}
/**
 * Legacy function for compatibility (formats data the old way)
 */
async function formatDataForLLM(data) {
    const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = data;
    let summary = 'Current Status Overview:\n\n';
    // Format Jira tasks
    if (jiraTasks && jiraTasks.length > 0) {
        summary += 'JIRA TASKS:\n';
        jiraTasks.forEach((task) => {
            summary += `• [${task.key}] ${task.summary} - Status: ${task.status}\n`;
        });
        summary += '\n';
    }
    // Format Notion pages
    if (notionPages && notionPages.length > 0) {
        summary += 'NOTION PROJECTS:\n';
        notionPages.forEach((page) => {
            summary += `• ${page.title} (Last updated: ${page.last_edited_time})\n`;
        });
        summary += '\n';
    }
    // Format calendar events
    if (calendarEvents && calendarEvents.length > 0) {
        summary += 'TODAY\'S CALENDAR:\n';
        calendarEvents.forEach((event) => {
            summary += `• ${event.summary} (${event.start} - ${event.end})\n`;
        });
        summary += '\n';
    }
    // Format conflicts
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
    try {
        const data = await taskManager.fetchAllStatus();
        const contextSummary = await formatDataForLLM(data);
        const prompt = `You are a productivity expert analyzing someone's current workload. Based on the following information, provide the top 3 priority items they should focus on today.

${contextSummary}

Respond with actionable priorities in a numbered list format. Be specific and reference actual tasks/meetings when possible.`;
        const suggestions = await llmService.complete(prompt, { max_tokens: 256 });
        // Save to database if sessionId provided
        if (sessionId) {
            try {
                await databaseService.saveChatHistory('Generate smart suggestions', suggestions, sessionId, {
                    type: 'smart_suggestions',
                    timestamp: new Date().toISOString()
                });
            }
            catch (dbError) {
                console.error('Error saving suggestions to database:', dbError);
            }
        }
        return suggestions;
    }
    catch (error) {
        console.error('Error generating suggestions:', error);
        throw error;
    }
}
export { processUserQuery, formatDataForLLM, generateSmartSuggestions };
//# sourceMappingURL=agentService_complex.js.map