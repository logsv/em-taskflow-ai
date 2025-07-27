import dotenv from 'dotenv';
import axios from 'axios';
// import { MultiServerMCPClient } from '@langchain/mcp-adapters'; // Temporarily commented out

dotenv.config();

// Type definitions
interface MCPServer {
  transport: {
    url: string;
  };
}

interface MCPServers {
  Notion: MCPServer;
}

interface ProjectPage {
  id: string;
  title: string;
  status?: string;
  last_edited_time: string;
}

interface TaskData {
  id: string;
  key?: string;
  summary: string;
  status: string;
  assignee?: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
}

interface AllStatusData {
  jiraTasks?: TaskData[];
  notionPages?: ProjectPage[];
  calendarEvents?: CalendarEvent[];
  calendarConflicts?: [CalendarEvent, CalendarEvent][];
}

// Initialize the MCP client for Notion
let notionMcpClient: any | null = null;
let notionTools: any = null;

/**
 * Initialize the MCP client for Notion
 * Temporarily disabled due to missing @langchain/mcp-adapters types
 */
async function initializeNotionMcpClient(): Promise<void> {
  // Temporarily commented out due to missing MCP types
  /*
  if (!notionMcpClient) {
    notionMcpClient = new MultiServerMCPClient({
      // Global tool configuration options
      throwOnLoadError: true,
      useStandardContentBlocks: true,
      
      // Server configuration
      mcpServers: {
        Notion: {
          transport: {
            url: 'https://mcp.notion.com/mcp',
          }
        }
      }
    });
  }
  */
  console.log('MCP client initialization temporarily disabled');
}

// MCP Server configuration
const mcpServers: MCPServers = {
  Notion: {
    transport: {
      url: 'https://mcp.notion.com/mcp',
    }
  }
};

const fetchProjectPages = async (): Promise<ProjectPage[]> => {
  try {
    const response = await axios.post(mcpServers.Notion.transport.url, {
      tool: 'fetchProjectPages',
      args: {},
    });
    return response.data.result || [];
  } catch (error) {
    console.error('MCP Notion fetchProjectPages error:', (error as Error).message);
    return [];
  }
};

const updatePageStatus = async (pageId: string, note: string): Promise<boolean> => {
  try {
    const response = await axios.post(mcpServers.Notion.transport.url, {
      tool: 'updatePageStatus',
      args: { pageId, note },
    });
    return response.data.result === true;
  } catch (error) {
    console.error('MCP Notion updatePageStatus error:', (error as Error).message);
    return false;
  }
};

const summarizePageUpdates = async (pageId: string): Promise<string[]> => {
  try {
    const response = await axios.post(mcpServers.Notion.transport.url, {
      tool: 'summarizePageUpdates',
      args: { pageId },
    });
    return response.data.result || [];
  } catch (error) {
    console.error('MCP Notion summarizePageUpdates error:', (error as Error).message);
    return ['Unable to fetch comments.'];
  }
};

// Placeholder functions for missing implementations
const fetchAllStatus = async (): Promise<AllStatusData> => {
  try {
    const [notionPages, jiraTasks, calendarEvents] = await Promise.all([
      fetchProjectPages(),
      fetchAssignedTasks(),
      fetchTodaysEvents()
    ]);

    const calendarConflicts = detectConflicts(calendarEvents);

    return {
      notionPages,
      jiraTasks,
      calendarEvents,
      calendarConflicts
    };
  } catch (error) {
    console.error('Error fetching all status:', error);
    return {};
  }
};

const fetchAssignedTasks = async (): Promise<TaskData[]> => {
  // Placeholder implementation - would integrate with Jira MCP
  try {
    // This would be implemented with actual Jira MCP integration
    return [];
  } catch (error) {
    console.error('Error fetching assigned tasks:', error);
    return [];
  }
};

const fetchTodaysEvents = async (): Promise<CalendarEvent[]> => {
  // Placeholder implementation - would integrate with Google Calendar MCP
  try {
    // This would be implemented with actual Google Calendar MCP integration
    return [];
  } catch (error) {
    console.error('Error fetching today\'s events:', error);
    return [];
  }
};

const updateTaskStatus = async (taskId: string, status: string): Promise<boolean> => {
  // Placeholder implementation - would integrate with Jira MCP
  try {
    // This would be implemented with actual Jira MCP integration
    return true;
  } catch (error) {
    console.error('Error updating task status:', error);
    return false;
  }
};

const markTaskComplete = async (taskId: string): Promise<boolean> => {
  return updateTaskStatus(taskId, 'Done');
};

const detectConflicts = (events: CalendarEvent[]): [CalendarEvent, CalendarEvent][] => {
  const conflicts: [CalendarEvent, CalendarEvent][] = [];
  
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];
      
      if (!event1 || !event2) continue;
      
      const start1 = new Date(event1.start);
      const end1 = new Date(event1.end);
      const start2 = new Date(event2.start);
      const end2 = new Date(event2.end);
      
      // Check for overlap
      if (start1 < end2 && start2 < end1) {
        conflicts.push([event1, event2]);
      }
    }
  }
  
  return conflicts;
};

const taskManager = {
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

export default taskManager;
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
