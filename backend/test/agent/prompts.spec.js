import {
  githubAgentPromptTemplate,
  jiraAgentPromptTemplate,
  notionAgentPromptTemplate,
  ragAgentPromptTemplate,
  supervisorAgentPromptTemplate,
  ragEnhancementTemplate,
  ragStreamEnhancementTemplate
} from '../../src/agent/prompts.js';

describe('Agent Prompts', () => {
  it('should render GitHub agent prompt correctly', async () => {
    const messages = await githubAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('You are a GitHub expert');
    expect(systemMessage.constructor.name).toBe('SystemMessage');
  });

  it('should render Jira agent prompt correctly', async () => {
    const messages = await jiraAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('You are a Jira expert');
    expect(systemMessage.constructor.name).toBe('SystemMessage');
  });

  it('should render Notion agent prompt correctly', async () => {
    const messages = await notionAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('You are a Notion workspace expert');
    expect(systemMessage.constructor.name).toBe('SystemMessage');
  });

  it('should render RAG agent prompt correctly', async () => {
    const messages = await ragAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('You are a retrieval specialist');
    expect(systemMessage.constructor.name).toBe('SystemMessage');
  });

  it('should render Supervisor agent prompt correctly', async () => {
    const messages = await supervisorAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).toContain('You are a supervisor agent');
    expect(systemMessage.constructor.name).toBe('SystemMessage');
  });

  it('should render RAG enhancement template correctly', async () => {
    const result = await ragEnhancementTemplate.format({ context: 'test context', question: 'test question' });
    expect(result).toContain('Context from documents:');
    expect(result).toContain('test context');
    expect(result).toContain('test question');
  });

  it('should render RAG stream enhancement template correctly', async () => {
    const result = await ragStreamEnhancementTemplate.format({ context: 'test context', question: 'test question' });
    expect(result).toContain('Context: test context');
    expect(result).toContain('User question: test question');
  });
});
