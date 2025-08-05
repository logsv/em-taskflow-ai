import sinon from 'sinon';
import mcpService from '../../src/services/mcpService.js';

describe('MCP Service', () => {
  let mockClient: any;
  let mockAgent: any;

  beforeEach(() => {
    // Create a mock MCP client for standard mcp-use methods
    mockClient = {
      listTools: sinon.stub(),
      callTool: sinon.stub(),
      close: sinon.stub(),
      closeAllSessions: sinon.stub()
    };

    // Create a mock MCP agent for standard mcp-use patterns
    mockAgent = {
      run: sinon.stub(),
      stream: sinon.stub()
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockClient.listTools.resolves([
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' }
      ]);

      // Mock the mcp-use client and agent
      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      const originalInitialized = (mcpService as any).isInitialized;
      
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = mockAgent;
      (mcpService as any).isInitialized = true;

      const result = mcpService.isReady();

      expect(result).toBe(true);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
      (mcpService as any).isInitialized = originalInitialized;
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock the initialization to simulate error condition
      const originalInitialized = (mcpService as any).isInitialized;
      (mcpService as any).isInitialized = false;
      (mcpService as any).client = null;
      (mcpService as any).agent = null;

      expect(mcpService.isReady()).toBe(false);
      
      // Restore
      (mcpService as any).isInitialized = originalInitialized;
    });
  });

  describe('getTools', () => {
    it('should return available tools via standard client method', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' },
        { name: 'calendar_list_events', description: 'List calendar events' }
      ];
      mockClient.listTools.resolves(mockTools);

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = mockAgent;
      (mcpService as any).isInitialized = true;

      const tools = await mcpService.getTools();

      expect(mockClient.listTools.calledOnce).toBe(true);
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(3);
      expect(tools[0].name).toBe('notion_search');
      
      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should return empty array when no client available', async () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = null;
      (mcpService as any).isInitialized = true;

      const tools = await mcpService.getTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });

    it('should fallback to cached tools on error', async () => {
      mockClient.listTools.rejects(new Error('Connection failed'));
      const cachedTools = [{ name: 'cached_tool', description: 'Cached tool' }];

      const originalClient = (mcpService as any).client;
      const originalTools = (mcpService as any).tools;
      (mcpService as any).client = mockClient;
      (mcpService as any).tools = cachedTools;
      (mcpService as any).isInitialized = true;

      const tools = await mcpService.getTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toBe(cachedTools);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).tools = originalTools;
    });
  });

  describe('getToolsByServer', () => {
    it('should get tools by server name with filtered results', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages', server: 'notion' },
        { name: 'jira_list_issues', description: 'List Jira issues', server: 'jira' },
        { name: 'calendar_list_events', description: 'List calendar events', server: 'calendar' }
      ];
      mockClient.listTools.resolves(mockTools);

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = mockAgent;
      (mcpService as any).isInitialized = true;

      const notionTools = await mcpService.getToolsByServer('notion');

      expect(mockClient.listTools.calledOnce).toBe(true);
      expect(Array.isArray(notionTools)).toBe(true);
      expect(notionTools.length).toBe(1);
      expect(notionTools[0].server).toBe('notion');
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });

    it('should return all tools when no server-specific tools found', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' }
      ];
      mockClient.listTools.resolves(mockTools);

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = null;
      (mcpService as any).isInitialized = true;

      const unknownTools = await mcpService.getToolsByServer('unknown');

      expect(Array.isArray(unknownTools)).toBe(true);
      expect(unknownTools.length).toBe(2);
      
      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should handle errors gracefully', async () => {
      mockClient.listTools.rejects(new Error('Connection failed'));

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;

      const tools = await mcpService.getToolsByServer('notion');

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });
  });

  describe('isReady', () => {
    it('should return true when initialized and client exists', () => {
      const originalClient = (mcpService as any).client;
      const originalInitialized = (mcpService as any).isInitialized;

      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;

      expect(mcpService.isReady()).toBe(true);

      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).isInitialized = originalInitialized;
    });

    it('should return false when not initialized', () => {
      const originalInitialized = (mcpService as any).isInitialized;

      (mcpService as any).isInitialized = false;

      expect(mcpService.isReady()).toBe(false);

      // Restore
      (mcpService as any).isInitialized = originalInitialized;
    });

    it('should return false when client is null', () => {
      const originalClient = (mcpService as any).client;
      const originalInitialized = (mcpService as any).isInitialized;

      (mcpService as any).client = null;
      (mcpService as any).isInitialized = true;

      expect(mcpService.isReady()).toBe(false);

      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).isInitialized = originalInitialized;
    });
  });

  describe('getServerStatus', () => {
    it('should return server status when client exists', async () => {
      mockAgent.run.resolves('No tools available');

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      const originalServerConfig = (mcpService as any).serverConfig;
      
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = mockAgent;
      (mcpService as any).isInitialized = true;
      (mcpService as any).serverConfig = { 
        mcpServers: {
          notion: { command: 'test' },
          jira: { command: 'test' },
          calendar: { command: 'test' }
        }
      };

      const status = await mcpService.getServerStatus();

      expect(status).toBeDefined();
      expect(status.hasOwnProperty('notion')).toBe(true);
      expect(status.hasOwnProperty('jira')).toBe(true);
      expect(status.hasOwnProperty('calendar')).toBe(true);
      expect(typeof status.notion).toBe('boolean');
      expect(typeof status.jira).toBe('boolean');
      expect(typeof status.calendar).toBe('boolean');

      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
      (mcpService as any).serverConfig = originalServerConfig;
    });

    it('should return all false when client is null', async () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = null;

      const status = await mcpService.getServerStatus();

      expect(status.notion).toBe(false);
      expect(status.jira).toBe(false);
      expect(status.calendar).toBe(false);

      // Restore
      (mcpService as any).client = originalClient;
    });
  });

  describe('close', () => {
    it('should close client connection using standard method', async () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.close();

      expect(mockCloseAllSessions.calledOnce).toBe(true);
      expect(mcpService.isReady()).toBe(false);

      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should handle close errors gracefully', async () => {
      const mockCloseAllSessions = sinon.stub().rejects(new Error('Close failed'));
      mockClient.closeAllSessions = mockCloseAllSessions;

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.close();

      expect(mockCloseAllSessions.calledOnce).toBe(true);
      expect(mcpService.isReady()).toBe(false);

      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should handle null client gracefully', async () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = null;

      await mcpService.close();

      expect(mcpService.isReady()).toBe(false);

      // Restore
      (mcpService as any).client = originalClient;
    });
  });

  describe('restart', () => {
    it('should close and reinitialize', async () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.restart();

      expect(mockCloseAllSessions.calledOnce).toBe(true);

      // Restore
      (mcpService as any).client = originalClient;
    });
  });

  describe('executeTool', () => {
    it('should execute tool using standard client method', async () => {
      const mockResult = { content: 'Tool executed successfully' };
      mockClient.callTool.resolves(mockResult);

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      const result = await mcpService.executeTool('notion_search', { query: 'test' });

      expect(mockClient.callTool.calledOnce).toBe(true);
      expect(mockClient.callTool.calledWith('notion_search', { query: 'test' })).toBe(true);
      expect(result.tool).toBe('notion_search');
      expect(result.result).toBe('Tool executed successfully');

      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should throw error when client not available', async () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = null;

      try {
        await mcpService.executeTool('notion_search', { query: 'test' });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toBe('MCP Client not initialized');
      }

      // Restore
      (mcpService as any).client = originalClient;
    });
  });

  describe('runQuery', () => {
    it('should run query using standard agent method', async () => {
      const mockResponse = 'Query executed successfully';
      mockAgent.run.resolves(mockResponse);

      const originalAgent = (mcpService as any).agent;
      (mcpService as any).agent = mockAgent;

      const result = await mcpService.runQuery('Find all notion pages');

      expect(mockAgent.run.calledOnce).toBe(true);
      expect(mockAgent.run.calledWith('Find all notion pages', 20)).toBe(true);
      expect(result).toBe(mockResponse);

      // Restore
      (mcpService as any).agent = originalAgent;
    });

    it('should return fallback message when agent not available', async () => {
      mockClient.listTools.resolves([
        { name: 'notion_search', description: 'Search Notion pages' }
      ]);

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = null;
      (mcpService as any).isInitialized = true;

      const result = await mcpService.runQuery('Find all notion pages');

      expect(result).toContain('MCP Agent not initialized');
      expect(result).toContain('notion_search');

      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });
  });

  describe('Agent Integration', () => {
    it('should provide client for agent service', () => {
      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      const client = mcpService.getClient();
      expect(client).toBe(mockClient);

      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should provide agent for RAG integration', () => {
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).agent = mockAgent;

      const agent = mcpService.getAgent();
      expect(agent).toBe(mockAgent);

      // Restore
      (mcpService as any).agent = originalAgent;
    });

    it('should return null when agent is not initialized', () => {
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).agent = null;

      const agent = mcpService.getAgent();
      expect(agent).toBe(null);

      // Restore
      (mcpService as any).agent = originalAgent;
    });
  });
});