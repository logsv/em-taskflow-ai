import {
  doraAgentPromptTemplate,
  sbiAgentPromptTemplate,
  peopleAgentPromptTemplate,
  deliveryAgentPromptTemplate,
  retroAgentPromptTemplate,
  sprintAgentPromptTemplate,
  sopAgentPromptTemplate,
  roadmapAgentPromptTemplate,
  okrAgentPromptTemplate,
  criticAgentPromptTemplate
} from '../../src/agent/prompts.js';

import {
  createDoraAgent,
  createSbiAgent,
  createPeopleAgent,
  createDeliveryAgent,
  createRetroAgent,
  createSprintAgent,
  createSopAgent,
  createRoadmapAgent,
  createOkrAgent,
  createCriticAgent
} from '../../src/agent/index.js';

describe('EM Multi-Agent System Modules', () => {
  it('should render DORA agent prompt correctly', async () => {
    const messages = await doraAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('DORA Metrics Specialist');
  });

  it('should render SBI agent prompt correctly', async () => {
    const messages = await sbiAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('SBI Coaching & Feedback Specialist');
  });

  it('should render People agent prompt correctly', async () => {
    const messages = await peopleAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('People Management Specialist');
  });

  it('should render Delivery agent prompt correctly', async () => {
    const messages = await deliveryAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('Delivery & Bottleneck Specialist');
  });

  it('should render Retro agent prompt correctly', async () => {
    const messages = await retroAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('Project Retrospective Specialist');
  });

  it('should render Sprint agent prompt correctly', async () => {
    const messages = await sprintAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('Sprint Planning Specialist');
  });

  it('should render SOP agent prompt correctly', async () => {
    const messages = await sopAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('SOP & Governance Specialist');
  });

  it('should render Roadmap agent prompt correctly', async () => {
    const messages = await roadmapAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('Roadmap & Strategic Alignment Specialist');
  });

  it('should render OKR agent prompt correctly', async () => {
    const messages = await okrAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('OKR & KPI Tracking Specialist');
  });

  it('should render Reflective Critic agent prompt correctly', async () => {
    const messages = await criticAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('Reflective Critic Agent');
  });

  it('should instantiate all 10 EM micro-agents with custom dummy tools', () => {
    const mockTool = { name: 'mock_tool', description: 'mock', invoke: async () => 'ok' };
    const mockLlm = { bindTools: () => mockLlm, invoke: async () => ({ content: 'test' }) };
    const opts = { llm: mockLlm };
    expect(createDoraAgent([mockTool], opts)).toBeDefined();
    expect(createSbiAgent([mockTool], opts)).toBeDefined();
    expect(createPeopleAgent([mockTool], opts)).toBeDefined();
    expect(createDeliveryAgent([mockTool], opts)).toBeDefined();
    expect(createRetroAgent([mockTool], opts)).toBeDefined();
    expect(createSprintAgent([mockTool], opts)).toBeDefined();
    expect(createSopAgent([mockTool], opts)).toBeDefined();
    expect(createRoadmapAgent([mockTool], opts)).toBeDefined();
    expect(createOkrAgent([mockTool], opts)).toBeDefined();
    expect(createCriticAgent([mockTool], opts)).toBeDefined();
  });
});
