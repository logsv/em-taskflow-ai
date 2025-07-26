import llmService from './llmService.js';
import taskManager from './taskManager.js';

/**
 * Formats data from all integrations into a readable summary for LLM processing
 */
async function formatDataForLLM(data) {
  const { jiraTasks, notionPages, calendarEvents, calendarConflicts } = data;
  
  let summary = 'Current Status Overview:\n\n';
  
  // Format Jira tasks
  if (jiraTasks && jiraTasks.length > 0) {
    summary += 'JIRA TASKS:\n';
    jiraTasks.forEach(task => {
      summary += `• [${task.key}] ${task.summary} - Status: ${task.status}\n`;
    });
    summary += '\n';
  }
  
  // Format Notion pages
  if (notionPages && notionPages.length > 0) {
    summary += 'NOTION PROJECTS:\n';
    notionPages.forEach(page => {
      summary += `• ${page.title} (Last updated: ${page.last_edited_time})\n`;
    });
    summary += '\n';
  }
  
  // Format calendar events
  if (calendarEvents && calendarEvents.length > 0) {
    summary += 'TODAY\'S CALENDAR:\n';
    calendarEvents.forEach(event => {
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
 * Processes user input and generates AI-powered responses
 */
async function processUserQuery(userInput) {
  try {
    // Fetch current data
    const data = await taskManager.fetchAllStatus();
    
    // Format data for context
    const contextSummary = await formatDataForLLM(data);
    
    // Create enhanced prompt with context
    const prompt = `You are an intelligent productivity assistant for EM TaskFlow. You have access to the user's current tasks, projects, and calendar.

${contextSummary}

User Question: ${userInput}

Provide a helpful, concise response based on the user's current workload. Focus on actionable insights and priorities. If the user asks about specific tasks or wants suggestions, reference the actual data above.`;
    
    // Get AI response
    const aiResponse = await llmService.complete(prompt, { maxTokens: 512 });
    
    return aiResponse;
  } catch (error) {
    console.error('Error processing user query:', error);
    throw error;
  }
}

/**
 * Generates smart priority suggestions based on current workload
 */
async function generateSmartSuggestions() {
  try {
    const data = await taskManager.fetchAllStatus();
    const contextSummary = await formatDataForLLM(data);
    
    const prompt = `You are a productivity expert analyzing someone's current workload. Based on the following information, provide the top 3 priority items they should focus on today.

${contextSummary}

Respond with actionable priorities in a numbered list format. Be specific and reference actual tasks/meetings when possible.`;
    
    const suggestions = await llmService.complete(prompt, { maxTokens: 256 });
    return suggestions;
  } catch (error) {
    console.error('Error generating suggestions:', error);
    throw error;
  }
}

export { formatDataForLLM };