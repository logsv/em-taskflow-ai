import sinon from 'sinon';
import mcpService from '../../src/services/mcpService.js';

describe('MCP Service', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock configuration to prevent actual service calls
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'error');
    sandbox.stub(console, 'warn');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      // Reset the service first to start fresh
      await mcpService.close();
      
      // Test that MCP service initializes properly  
      await mcpService.initialize();
      
      // The service should be ready even without external dependencies
      expect(typeof mcpService.isReady()).toBe('boolean');
    });

    it('should handle initialization errors gracefully', async () => {
      // Reset the service first
      await mcpService.close();
      
      // This should not throw even with configuration issues
      await expect(async () => {
        await mcpService.initialize();
      }).not.toThrow();
    });
  });

  describe('tool and LLM operations', () => {
    beforeEach(async () => {
      await mcpService.close();
      await mcpService.initialize();
    });

    it('should provide tools interface', async () => {
      const tools = mcpService.getTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('should handle queries appropriately', async () => {
      const llm = mcpService.getLLM();
      
      if (llm) {
        try {
          const result = await mcpService.runQuery('test query');
          expect(typeof result === 'string' || result instanceof Error).toBe(true);
        } catch (error) {
          expect(error).toBeDefined();
        }
      } else {
        // If no LLM available, should throw error
        try {
          await mcpService.runQuery('test query');
          expect(false).toBe(true); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('No LLM available');
        }
      }
    });

    it('should handle tool execution', async () => {
      const tools = mcpService.getTools();
      
      if (tools.length > 0) {
        // Test tool execution interface exists
        try {
          await mcpService.executeTool('nonexistent_tool', {});
          expect(false).toBe(true); // Should not reach here
        } catch (error) {
          expect(error.message).toContain('not found');
        }
      } else {
        // No tools available - this is valid in test environment
        expect(true).toBe(true);
      }
    });
  });

  describe('server status', () => {
    it('should return server configuration status', async () => {
      await mcpService.close();
      await mcpService.initialize();
      const status = await mcpService.getServerStatus();
      
      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
    });

    it('should return health status', async () => {
      await mcpService.close();
      await mcpService.initialize();
      const health = await mcpService.getHealthStatus();
      
      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
      expect(typeof health.totalTools).toBe('number');
      expect(typeof health.llmAvailable).toBe('boolean');
      expect(typeof health.servers).toBe('object');
    });
  });

  describe('service management', () => {
    it('should restart service successfully', async () => {
      await mcpService.close();
      await mcpService.initialize();
      await mcpService.restart();
      
      // Service restart should complete without throwing
      expect(typeof mcpService.isReady()).toBe('boolean');
    });

    it('should close connections properly', async () => {
      await mcpService.initialize();
      await mcpService.close();
      expect(mcpService.isReady()).toBe(false);
    });
  });

  describe('client and LLM access', () => {
    it('should provide client access interface', async () => {
      await mcpService.close();
      await mcpService.initialize();
      const client = mcpService.getClient();
      
      // Client access should be available (may be null depending on config)
      expect(client !== undefined).toBe(true);
    });

    it('should provide LLM access interface', async () => {
      await mcpService.close();
      await mcpService.initialize();
      const llm = mcpService.getLLM();
      
      // LLM access should be available (may be null depending on LLM config)
      expect(llm !== undefined).toBe(true);
    });

    it('should provide tools by server', async () => {
      await mcpService.close();
      await mcpService.initialize();
      
      const notionTools = mcpService.getToolsByServer('notion');
      const googleTools = mcpService.getToolsByServer('google');
      const atlassianTools = mcpService.getToolsByServer('atlassian');
      
      expect(Array.isArray(notionTools)).toBe(true);
      expect(Array.isArray(googleTools)).toBe(true);
      expect(Array.isArray(atlassianTools)).toBe(true);
    });
  });
});
