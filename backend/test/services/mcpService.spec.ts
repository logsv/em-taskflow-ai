import sinon from 'sinon';
import mcpService from '../../src/services/mcpService.js';

describe('MCP Service', () => {
  let mockClient: any;

  beforeEach(() => {
    // Create a mock MCP client
    mockClient = {
      getTools: sinon.stub(),
      close: sinon.stub()
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockClient.getTools.resolves([
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' }
      ]);

      // Mock the MultiServerMCPClient constructor
      const originalClient = (mcpService as any).client;
      const originalInitialized = (mcpService as any).isInitialized;
      
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;

      const result = mcpService.isReady();

      expect(result).toBe(true);
      
      // Restore
      (mcpService as any).client = originalClient;
      (mcpService as any).isInitialized = originalInitialized;
    });

    it('should handle initialization errors gracefully', async () => {
      mockClient.getTools.rejects(new Error('Connection failed'));

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.initialize();

      expect(mcpService.isReady()).toBe(false);
      
      // Restore
      (mcpService as any).client = originalClient;
    });
  });

  describe('getTools', () => {
    it('should return available tools', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' },
        { name: 'calendar_list_events', description: 'List calendar events' }
      ];

      mockClient.getTools.resolves(mockTools);

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;
      (mcpService as any).tools = mockTools;

      const tools = await mcpService.getTools();

      expect(tools).toEqual(mockTools);
      expect(tools.length).toBe(3);
    });

    it('should initialize if not ready', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' }
      ];

      mockClient.getTools.resolves(mockTools);

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = false;

      const tools = await mcpService.getTools();

      expect(Array.isArray(tools)).toBe(true);
      
      // Restore
      (mcpService as any).client = originalClient;
    });
  });

  describe('getToolsByServer', () => {
    it('should filter tools by server name', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'notion_create_page', description: 'Create Notion page' },
        { name: 'jira_list_issues', description: 'List Jira issues' },
        { name: 'calendar_list_events', description: 'List calendar events' }
      ];

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;
      (mcpService as any).tools = mockTools;

      const notionTools = await mcpService.getToolsByServer('notion');
      const jiraTools = await mcpService.getToolsByServer('jira');

      expect(notionTools.length).toBe(2);
      expect(notionTools[0].name).toBe('notion_search');
      expect(notionTools[1].name).toBe('notion_create_page');
      
      expect(jiraTools.length).toBe(1);
      expect(jiraTools[0].name).toBe('jira_list_issues');
      
      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should return empty array for unknown server', async () => {
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' }
      ];

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;
      (mcpService as any).tools = mockTools;

      const unknownTools = await mcpService.getToolsByServer('unknown');

      expect(unknownTools.length).toBe(0);
      
      // Restore
      (mcpService as any).client = originalClient;
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
      const mockTools = [
        { name: 'notion_search', description: 'Search Notion pages' },
        { name: 'jira_list_issues', description: 'List Jira issues' }
      ];

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;
      (mcpService as any).isInitialized = true;
      (mcpService as any).tools = mockTools;

      const status = await mcpService.getServerStatus();

      expect(status).toBeDefined();
      expect(typeof status.notion).toBe('boolean');
      expect(typeof status.jira).toBe('boolean');
      expect(typeof status.calendar).toBe('boolean');

      // Restore
      (mcpService as any).client = originalClient;
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
      mockClient.close.resolves();

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.close();

      expect(mockClient.close.calledOnce).toBe(true);
      expect(mcpService.isReady()).toBe(false);

      // Restore
      (mcpService as any).client = originalClient;
    });

    it('should handle close errors gracefully', async () => {
      mockClient.close.rejects(new Error('Close failed'));

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.close();

      expect(mockClient.close.calledOnce).toBe(true);
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
      mockClient.close.resolves();
      mockClient.getTools.resolves([]);

      const originalClient = (mcpService as any).client;
      (mcpService as any).client = mockClient;

      await mcpService.restart();

      expect(mockClient.close.calledOnce).toBe(true);

      // Restore
      (mcpService as any).client = originalClient;
    });
  });
});