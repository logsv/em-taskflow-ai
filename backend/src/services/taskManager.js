import dotenv from 'dotenv';
import axios from 'axios';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

dotenv.config();

// Initialize the MCP client for Notion
let notionMcpClient = null;
let notionTools = null;

/**
 * Initialize the MCP client for Notion
 */
async function initializeNotionMcpClient() {
  if (!notionMcpClient) {
    notionMcpClient = new MultiServerMCPClient({
      // Global tool configuration options
      throwOnLoadError: true,
      useStandardContentBlocks: true,
      
      // Server configuration
      mcpServers: {
        Notion: {
          transport: 
    url: 'https://mcp.notion.com/mcp',
  },
};

const fetchProjectPages = async () => {
  try {
    const response = await axios.post(mcpServers.Notion.url, {
      tool: 'fetchProjectPages',
      args: {},
    });
    return response.data.result || [];
  } catch (error) {
    console.error('MCP Notion fetchProjectPages error:', error.message);
    return [];
  }
};

const updatePageStatus = async (pageId, note) => {
  try {
    const response = await axios.post(mcpServers.Notion.url, {
      tool: 'updatePageStatus',
      args: { pageId, note },
    });
    return response.data.result === true;
  } catch (error) {
    console.error('MCP Notion updatePageStatus error:', error.message);
    return false;
  }
};

const summarizePageUpdates = async (pageId) => {
  try {
    const response = await axios.post(mcpServers.Notion.url, {
      tool: 'summarizePageUpdates',
      args: { pageId },
    });
    return response.data.result || [];
  } catch (error) {
    console.error('MCP Notion summarizePageUpdates error:', error.message);
    return ['Unable to fetch comments.'];
  }
};

export { 
  fetchAllStatus, 
  fetchAssignedTasks, 
  fetchProjectPages, 
  fetchTodaysEvents, 
  updateTaskStatus, 
  updatePageStatus, 
  markTaskComplete, 
  detectConflicts, 
  summarizePageUpdates 
};
