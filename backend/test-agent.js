import { buildAgent, executeAgentQuery } from './dist/agent/graph.js';

async function testAgent() {
  console.log('🧪 Testing LangGraph ReAct Agent with gpt-oss:20b...');
  
  try {
    console.log('📋 Building agent...');
    const { app, toolCount } = await buildAgent();
    console.log(`✅ Agent built successfully with ${toolCount} tools`);
    
    console.log('🤖 Testing agent query...');
    const response = await executeAgentQuery('Hello! What can you help me with?', {
      maxIterations: 3
    });
    
    console.log('✅ Agent Response:');
    console.log(response.response);
    console.log(`📊 Execution time: ${response.executionTime}ms`);
    console.log(`🔧 Tools used: ${response.toolsUsed.join(', ') || 'None'}`);
    
  } catch (error) {
    console.error('❌ Agent test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testAgent();