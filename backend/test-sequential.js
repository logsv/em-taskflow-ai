#!/usr/bin/env node

// Test sequential LLM calls like the agent service does
import enhancedLlmService from './dist/services/enhancedLlmService.js';

async function testSequentialCalls() {
  try {
    console.log('🧪 Testing sequential LLM calls...');

    // Initialize the service (like agent service does)
    if (!enhancedLlmService.isInitialized()) {
      console.log('🔄 Initializing enhanced LLM service...');
      await enhancedLlmService.initialize();
    }

    console.log('✅ Service initialized');

    // First call - simulate intent analysis
    console.log('📋 Call 1: Intent analysis simulation...');
    const intentPrompt = `Analyze this user query and determine:
1. Intent category: 'status_check', 'task_management', 'calendar_query', 'project_overview', 'general'
2. Data sources needed: 'jira', 'notion', 'calendar', 'google', 'atlassian', or combinations

User Query: "What is machine learning?"

Respond in JSON format:
{
  "intent": "category",
  "dataNeeded": ["source1", "source2"],
  "reasoning": "brief explanation"
}`;

    const start1 = Date.now();
    const response1 = await enhancedLlmService.complete(intentPrompt, { temperature: 0.3, maxTokens: 100 });
    const end1 = Date.now();
    
    console.log(`✅ Call 1 completed in ${end1 - start1}ms`);
    console.log('Response 1:', response1.substring(0, 100) + '...');

    // Second call - simulate response generation  
    console.log('📋 Call 2: Response generation simulation...');
    const responsePrompt = `You are an AI assistant for task and project management.
  
User Query: "What is machine learning?"
Intent: general

Provide a helpful, comprehensive response about machine learning.`;

    const start2 = Date.now();
    const response2 = await enhancedLlmService.complete(responsePrompt, { temperature: 0.7, maxTokens: 200 });
    const end2 = Date.now();
    
    console.log(`✅ Call 2 completed in ${end2 - start2}ms`);
    console.log('Response 2:', response2.substring(0, 100) + '...');

    console.log('🎉 Sequential calls test completed successfully!');

  } catch (error) {
    console.error('❌ Sequential calls test failed:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testSequentialCalls();