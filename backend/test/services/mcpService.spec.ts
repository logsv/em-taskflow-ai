import sinon from 'sinon';
import mcpService from '../../src/services/mcpService.js';

describe('MCP Service', () => {
  let mockClient: any;
  let mockAgent: any;

  beforeEach(() => {
    // Create a mock MCP client for mcp-use
    mockClient = {
      listTools: sinon.stub(),
      callTool: sinon.stub(),
      close: sinon.stub()
    };

    // Create a mock MCP agent
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
    it('should return available tools via agent query', async () => {
      const mockResponse = 'Available tools: notion_search, jira_list_issues, calendar_list_events';
      mockAgent.run.resolves(mockResponse);

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = mockAgent;
      (mcpService as any).isInitialized = true;

      const tools = await mcpService.getTools();

      expect(mockAgent.run.calledOnce).toBe(true);
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });

    it('should return empty array when no agent available', async () => {
      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = null;
      (mcpService as any).isInitialized = true;

      const tools = await mcpService.getTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });
  });

  describe('getToolsByServer', () => {
    it('should get tools by server name via agent query', async () => {
      const mockResponse = 'Notion tools: notion_search, notion_create_page';
      mockAgent.run.resolves(mockResponse);

      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = mockAgent;
      (mcpService as any).isInitialized = true;

      const notionTools = await mcpService.getToolsByServer('notion');

      expect(mockAgent.run.calledOnce).toBe(true);
      expect(Array.isArray(notionTools)).toBe(true);
      expect(notionTools.length).toBe(1);
      expect(notionTools[0].server).toBe('notion');
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).agent = originalAgent;
    });

    it('should return empty array when no agent available', async () => {
      const originalClient = (mcpService as any).client;
      const originalAgent = (mcpService as any).agent;
      (mcpService as any).client = mockClient;
      (mcpService as any).agent = null;
      (mcpService as any).isInitialized = true;

      const unknownTools = await mcpService.getToolsByServer('unknown');

      expect(unknownTools.length).toBe(0);
      
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
    it('should close client connection', async () => {
      const mockCloseAllSessions = sinon.stub().resolves();
      mockClient.closeAllSessions = mockCloseAllSessions;

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
      const mockCloseAllSessions = sinon.stub().resolves();
      mockClient.closeAllSessions = mockCloseAllSessions;

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.restart();

      expect(mockCloseAllSessions.calledOnce).toBe(true);

      // Restore
      (mcpService as any).client = originalClient;
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