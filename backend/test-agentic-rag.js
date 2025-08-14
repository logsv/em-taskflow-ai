import agenticRagService from './dist/services/agenticRagService.js';

async function testAgenticRAG() {
  console.log('🧪 Testing Enhanced Agentic RAG Service...');
  
  try {
    console.log('📋 Initializing service...');
    await agenticRagService.initialize();
    
    console.log('📊 Getting service status...');
    const status = await agenticRagService.getStatus();
    console.log('✅ Service Status:');
    console.log(JSON.stringify(status, null, 2));
    
    // Test simple query without documents
    console.log('🔍 Testing simple query...');
    const testQuery = "What is machine learning?";
    
    try {
      const result = await agenticRagService.agenticRetrieve(testQuery, {
        enableQueryRewriting: true,
        enableCompression: true,
        enableReranking: true,
      });
      
      console.log('✅ Agentic RAG Result:');
      console.log(`Answer: ${result.answer.slice(0, 200)}...`);
      console.log(`Original Query: ${result.originalQuery}`);
      console.log(`Rewritten Queries: ${result.rewrittenQueries.join(', ')}`);
      console.log(`Sources: ${result.sources.length}`);
      console.log(`Execution Time: ${result.executionTime}ms`);
      console.log(`Reranked: ${result.reranked}`);
      console.log(`Compression Applied: ${result.compressionApplied}`);
      
    } catch (queryError) {
      console.log('⚠️ Query test failed (expected with no documents):', queryError.message);
    }
    
    console.log('🎉 Agentic RAG service test completed!');
    
  } catch (error) {
    console.error('❌ Agentic RAG test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testAgenticRAG();