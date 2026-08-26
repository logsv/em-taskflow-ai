import axios from 'axios';
import { getSlackTools, testSlackConnection, closeSlackMcp } from '../../src/mcp/slack.js';
import { sprintRetroTool } from '../../src/agent/retroAgent.js';
import { sbiFeedbackTool } from '../../src/agent/sbiAgent.js';
import { getMCPToolGroups, getMCPToolsByServer } from '../../src/mcp/index.js';

describe('Slack MCP Tool Integration & Agent Harness Specs', () => {
  let originalPost;
  let originalGet;

  beforeEach(() => {
    originalPost = axios.post;
    originalGet = axios.get;
  });

  afterEach(async () => {
    axios.post = originalPost;
    axios.get = originalGet;
    await closeSlackMcp();
  });

  describe('1. Slack Tool Definitions & Server Lookups', () => {
    it('should create and export 3 Slack MCP tools with correct names and schemas', async () => {
      const tools = await getSlackTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(3);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('slack_search_messages');
      expect(toolNames).toContain('slack_post_message');
      expect(toolNames).toContain('slack_list_channels');
    });

    it('should include slack in getMCPToolGroups and getMCPToolsByServer', () => {
      const groups = getMCPToolGroups();
      expect(groups.slackTools).toBeDefined();

      const serverTools = getMCPToolsByServer('slack');
      expect(Array.isArray(serverTools)).toBe(true);
    });
  });

  describe('2. testSlackConnection', () => {
    it('should return error when no bot token is provided', async () => {
      const res = await testSlackConnection({ botToken: '' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('No Slack Bot Token');
    });

    it('should return success when Slack auth.test succeeds', async () => {
      axios.post = jasmine.createSpy('axios.post').and.returnValue(
        Promise.resolve({
          data: {
            ok: true,
            team: 'Acme Engineering',
            user: 'taskflow_bot',
            bot_id: 'B12345',
          },
        })
      );
      axios.get = jasmine.createSpy('axios.get').and.returnValue(
        Promise.resolve({
          data: {
            ok: true,
            channels: [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'engineering-retro' }],
          },
        })
      );

      const res = await testSlackConnection({ botToken: 'xoxb-test-valid-token' });
      expect(res.success).toBe(true);
      expect(res.team).toBe('Acme Engineering');
      expect(res.user).toBe('taskflow_bot');
      expect(res.channels_count).toBe(2);
      expect(res.message).toContain("Connected to Slack Workspace 'Acme Engineering'");
    });

    it('should return failure when Slack auth.test fails with invalid_auth', async () => {
      axios.post = jasmine.createSpy('axios.post').and.returnValue(
        Promise.resolve({
          data: {
            ok: false,
            error: 'invalid_auth',
          },
        })
      );

      const res = await testSlackConnection({ botToken: 'xoxb-invalid-token' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('Slack Authentication Error: invalid_auth');
    });

    it('should handle network timeout gracefully', async () => {
      axios.post = jasmine.createSpy('axios.post').and.returnValue(
        Promise.reject(new Error('timeout of 4500ms exceeded'))
      );

      const res = await testSlackConnection({ botToken: 'xoxb-timeout-token' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('Failed to connect to Slack API');
    });
  });

  describe('3. Slack Tool Execution', () => {
    it('slack_search_messages should return UNAVAILABLE if token unconfigured', async () => {
      const tools = await getSlackTools();
      const searchTool = tools.find((t) => t.name === 'slack_search_messages');
      const oldEnv = process.env.SLACK_BOT_TOKEN;
      process.env.SLACK_BOT_TOKEN = '';

      const raw = await searchTool.invoke({ query: 'retro' });
      const parsed = JSON.parse(raw);
      expect(parsed.status).toBe('UNAVAILABLE');
      expect(parsed.reason).toBe('SLACK_BOT_TOKEN_NOT_CONFIGURED');

      if (oldEnv !== undefined) process.env.SLACK_BOT_TOKEN = oldEnv;
      else delete process.env.SLACK_BOT_TOKEN;
    });

    it('slack_search_messages should return filtered messages when token is present', async () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-mock-token';
      axios.get = jasmine.createSpy('axios.get').and.returnValue(
        Promise.resolve({
          data: {
            ok: true,
            messages: [
              { user: 'alex.williams', text: 'Great sprint velocity and retro discussion on CI', ts: '1700000001' },
              { user: 'sarah.chen', text: 'Unrelated message', ts: '1700000002' },
            ],
          },
        })
      );

      const tools = await getSlackTools();
      const searchTool = tools.find((t) => t.name === 'slack_search_messages');
      const raw = await searchTool.invoke({ query: 'retro', channel: '#engineering-retro' });
      const parsed = JSON.parse(raw);

      expect(parsed.status).toBe('SUCCESS');
      expect(parsed.total).toBe(1);
      expect(parsed.messages[0].user).toBe('alex.williams');
      expect(parsed.messages[0].text).toContain('retro discussion');

      delete process.env.SLACK_BOT_TOKEN;
    });

    it('slack_post_message should return PENDING_HUMAN_APPROVAL when not approved by human', async () => {
      const tools = await getSlackTools();
      const postTool = tools.find((t) => t.name === 'slack_post_message');

      const raw = await postTool.invoke({ message: 'Action item: fix tests', channel: '#engineering-retro' });
      const parsed = JSON.parse(raw);
      expect(parsed.status).toBe('PENDING_HUMAN_APPROVAL');
      expect(parsed.target_channel).toBe('#engineering-retro');
      expect(parsed.workflowId).toBeDefined();
      expect(parsed.requires_approval).toBe(true);
    });

    it('slack_post_message should post successfully when approved by human and token configured', async () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-mock-token';
      axios.post = jasmine.createSpy('axios.post').and.returnValue(
        Promise.resolve({
          data: {
            ok: true,
            ts: '1700000099.000100',
            channel: 'C12345',
          },
        })
      );

      const tools = await getSlackTools();
      const postTool = tools.find((t) => t.name === 'slack_post_message');
      const raw = await postTool.invoke({
        message: 'SMART Action Plan',
        channel: '#engineering-retro',
        approved_by_human: true,
        approver: 'Sarah Chen (EM)',
      });
      const parsed = JSON.parse(raw);

      expect(parsed.status).toBe('SUCCESS');
      expect(parsed.ts).toBe('1700000099.000100');
      expect(parsed.approved_by).toBe('Sarah Chen (EM)');

      delete process.env.SLACK_BOT_TOKEN;
    });

    it('slack_list_channels should list accessible channels', async () => {
      process.env.SLACK_BOT_TOKEN = 'xoxb-mock-token';
      axios.get = jasmine.createSpy('axios.get').and.returnValue(
        Promise.resolve({
          data: {
            ok: true,
            channels: [
              { id: 'C100', name: 'engineering-retro', is_private: false, num_members: 14 },
              { id: 'C200', name: 'deployments', is_private: false, num_members: 22 },
            ],
          },
        })
      );

      const tools = await getSlackTools();
      const listTool = tools.find((t) => t.name === 'slack_list_channels');
      const raw = await listTool.invoke({ limit: 10 });
      const parsed = JSON.parse(raw);

      expect(parsed.status).toBe('SUCCESS');
      expect(parsed.total).toBe(2);
      expect(parsed.channels[0].name).toBe('engineering-retro');

      delete process.env.SLACK_BOT_TOKEN;
    });
  });

  describe('4. Domain Agent Integration with Slack', () => {
    it('sprintRetroTool should execute with slack source and post_to_slack option', async () => {
      const res = await sprintRetroTool.invoke({
        sprint_name: 'Sprint 42',
        sources: ['default', 'slack'],
        post_to_slack: true,
        slack_channel: '#engineering-retro',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.what_went_well).toBeDefined();
      expect(res.data.extracted_action_items).toBeDefined();
      expect(res.data.extracted_action_items.length).toBeGreaterThan(0);
      expect(res.data.slack_post_status).toBeDefined();
    });

    it('sbiFeedbackTool should execute with slack source', async () => {
      const res = await sbiFeedbackTool.invoke({
        engineer_id: 'eng_alex',
        sources: ['default', 'slack'],
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.data.structured_feedback).toBeDefined();
      expect(res.data.talking_script).toBeDefined();
    });
  });
});
