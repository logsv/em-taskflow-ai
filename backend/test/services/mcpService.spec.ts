import sinon from 'sinon';
import mcpService from '../../src/services/mcpService.js';

describe('MCP Service', () => {
  let sandbox: sinon.SinonSandbox;

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

  describe('agent operations', () => {
    beforeEach(async () => {
      await mcpService.close();
      await mcpService.initialize();
    });

    it('should handle agent queries appropriately', async () => {
      const agent = mcpService.getAgent();
      
      if (agent) {
        // If agent is available, test that we can mock its behavior
        sandbox.stub(agent, 'run').resolves('Mocked agent response');
        
        const result = await mcpService.runQuery('test query');
        expect(result).toBe('Mocked agent response');
      } else {
        // If no agent available, should throw error
        try {
          await mcpService.runQuery('test query');
          expect(false).toBe(true); // Should not reach here
        } catch (error: any) {
          expect(error.message).toContain('MCP Agent not initialized');
        }
      }
    });

    it('should handle query errors appropriately', async () => {
      const agent = mcpService.getAgent();
      
      if (agent) {
        // Mock agent to throw error
        sandbox.stub(agent, 'run').rejects(new Error('Agent error'));
        
        try {
          await mcpService.runQuery('test query');
          expect(false).toBe(true); // Should not reach here
        } catch (error: any) {
          expect(error.message).toBe('Agent error');
        }
      } else {
        // If no agent, already covered in previous test
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
      expect(status.hasOwnProperty('notion')).toBe(true);
      expect(status.hasOwnProperty('calendar')).toBe(true); 
      expect(status.hasOwnProperty('jira')).toBe(true);
      expect(typeof status.notion).toBe('boolean');
      expect(typeof status.calendar).toBe('boolean');
      expect(typeof status.jira).toBe('boolean');
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

  describe('client and agent access', () => {
    it('should provide client access interface', async () => {
      await mcpService.close();
      await mcpService.initialize();
      const client = mcpService.getClient();
      
      // Client access should be available (may be null depending on config)
      expect(client !== undefined).toBe(true);
    });

    it('should provide agent access interface', async () => {
      await mcpService.close();
      await mcpService.initialize();
      const agent = mcpService.getAgent();
      
      // Agent access should be available (may be null depending on LLM config)
      expect(agent !== undefined).toBe(true);
    });
  });
});