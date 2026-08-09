import { expect } from 'chai';
import {
  doraAgentPromptTemplate,
  sbiAgentPromptTemplate,
  peopleAgentPromptTemplate,
  deliveryAgentPromptTemplate,
  supervisorAgentPromptTemplate,
  ragEnhancementTemplate,
  ragStreamEnhancementTemplate
} from '../../src/agent/prompts.js';

describe('Agent Prompts', () => {
  it('should render DORA agent prompt correctly', async () => {
    const messages = await doraAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).to.include('DORA Metrics Specialist');
  });

  it('should render SBI agent prompt correctly', async () => {
    const messages = await sbiAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).to.include('SBI Coaching & Feedback Specialist');
  });

  it('should render People agent prompt correctly', async () => {
    const messages = await peopleAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).to.include('People Management Specialist');
  });

  it('should render Delivery agent prompt correctly', async () => {
    const messages = await deliveryAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).to.include('Delivery & Bottleneck Specialist');
  });

  it('should render Supervisor agent prompt correctly', async () => {
    const messages = await supervisorAgentPromptTemplate.invoke({});
    const systemMessage = messages.toChatMessages()[0];
    expect(systemMessage.content).to.include('You are a supervisor agent');
  });

  it('should render RAG enhancement template correctly', async () => {
    const result = await ragEnhancementTemplate.format({ context: 'test context', question: 'test question' });
    expect(result).to.include('Context from documents:');
    expect(result).to.include('test context');
    expect(result).to.include('test question');
  });

  it('should render RAG stream enhancement template correctly', async () => {
    const result = await ragStreamEnhancementTemplate.format({ context: 'test context', question: 'test question' });
    expect(result).to.include('Context: test context');
    expect(result).to.include('User question: test question');
  });
});
