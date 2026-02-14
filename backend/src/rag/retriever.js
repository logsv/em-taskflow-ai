/**
 * RAG Retriever module - Advanced retrieval with compression
 * Implements agentic retrieval patterns with query rewriting and retrieval strategy controls
 */

import { Document } from 'langchain/document';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { getVectorStore } from './ingest.js';
import { getChatModel } from '../llm/index.js';
import { getRagConfig, getRagAdvancedConfig } from '../config.js';

// Retrieval configuration
const MAX_RETRIEVAL_K = 30; // Initial retrieval
const MMR_LAMBDA = 0.7; // Balance between relevance and diversity

/**
 * Baseline retrieval: vector search + answer generation
 */
export async function baselineRetrieve(query, options = {}) {
  const startTime = Date.now();
  const ragConfig = getRagConfig();
  const {
    topK = ragConfig.topK || 6,
    metadataFilter = null,
  } = options;

  try {
    const docs = await baseRetrieve(query, topK, { strategy: 'similarity', metadataFilter });
    const answer = await generateAnswer(query, docs);
    const executionTime = Date.now() - startTime;

    return {
      answer,
      sources: docs,
      originalQuery: query,
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('❌ Baseline retrieval failed:', error);
    return {
      answer: `I encountered an error during retrieval: ${error.message}`,
      sources: [],
      originalQuery: query,
      executionTime,
    };
  }
}

/**
 * Perform agentic retrieval with query rewriting, retrieval strategy, and compression
 */
export async function agenticRetrieve(query, options = {}) {
  const startTime = Date.now();
  const ragConfig = getRagConfig();
  const ragAdvanced = getRagAdvancedConfig();

  const {
    enableQueryRewriting = ragAdvanced.queryRewrite.enabled,
    enableCompression = ragAdvanced.compression.enabled,
    maxQueries = ragAdvanced.queryRewrite.maxQueries,
    initialK = ragAdvanced.retrieval.initialK,
    retrievalStrategy = ragAdvanced.retrieval.strategy,
    mmrLambda = ragAdvanced.retrieval.mmrLambda,
    topK = ragConfig.topK || 6,
    metadataFilter = null,
  } = options;

  try {
    console.log('🔍 Starting agentic retrieval for:', query.slice(0, 100) + '...');

    // Step 1: Query rewriting and expansion
    let queries = [query];
    if (enableQueryRewriting) {
      queries = await rewriteQueries(query, maxQueries);
      console.log(`📝 Generated ${queries.length} query variants`);
    }

    // Step 2: Multi-query retrieval
    const allDocuments = [];
    for (const q of queries) {
      const docs = await baseRetrieve(q, initialK || MAX_RETRIEVAL_K, {
        strategy: retrievalStrategy,
        mmrLambda,
        metadataFilter,
      });
      allDocuments.push(...docs);
    }

    // Remove duplicates
    const uniqueDocs = deduplicateDocuments(allDocuments);
    console.log(`📋 Retrieved ${uniqueDocs.length} unique documents from ${allDocuments.length} total`);

    // Step 3: Select top K after retrieval
    let rankedDocs = uniqueDocs.slice(0, topK);

    // Step 4: Contextual compression
    let finalDocs = rankedDocs;
    if (enableCompression) {
      finalDocs = await compressDocuments(query, rankedDocs);
      console.log(`🗜️ Applied contextual compression`);
    }

    // Step 5: Generate answer
    const answer = await generateAnswer(query, finalDocs);

    const executionTime = Date.now() - startTime;
    console.log(`✅ Agentic retrieval completed in ${executionTime}ms`);

    return {
      answer,
      sources: finalDocs,
      originalQuery: query,
      rewrittenQueries: queries,
      relevanceScores: finalDocs.map((doc) => doc.metadata?.compressionScore ?? null),
      compressionApplied: enableCompression,
      executionTime,
    };

  } catch (error) {
    console.error('❌ Agentic retrieval failed:', error);
    const executionTime = Date.now() - startTime;
    
    return {
      answer: `I encountered an error during retrieval: ${error.message}`,
      sources: [],
      originalQuery: query,
      rewrittenQueries: [query],
      relevanceScores: [],
      compressionApplied: false,
      executionTime,
    };
  }
}

/**
 * Simple retrieval for backward compatibility
 */
export async function simpleRetrieve(query, topK = 5) {
  try {
    const docs = await baseRetrieve(query, topK);
    
    return {
      chunks: docs.map(doc => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score: 0.8, // Placeholder score
      })),
      sources: [...new Set(docs.map(doc => doc.metadata.filename || 'unknown'))],
      context: docs.map(doc => doc.pageContent).join('\n\n'),
    };
  } catch (error) {
    console.error('❌ Simple retrieval failed:', error);
    return {
      chunks: [],
      sources: [],
      context: '',
    };
  }
}

/**
 * Base retrieval from vector store
 */
async function baseRetrieve(query, k, options = {}) {
  const vectorStore = getVectorStore();
  if (!vectorStore) {
    throw new Error('Vector store not initialized');
  }

  const { strategy = 'similarity', mmrLambda = MMR_LAMBDA, metadataFilter = null } = options;

  try {
    if (strategy === 'mmr') {
      try {
        if (typeof vectorStore.maxMarginalRelevanceSearch === 'function') {
          return await vectorStore.maxMarginalRelevanceSearch(query, {
            k,
            fetchK: Math.max(k * 3, 20),
            lambda: mmrLambda,
            filter: metadataFilter || undefined,
          });
        }
        const retriever = vectorStore.asRetriever({
          k,
          searchType: 'mmr',
          searchKwargs: {
            lambda: mmrLambda,
            filter: metadataFilter || undefined,
          }
        });
        return await retriever.getRelevantDocuments(query);
      } catch (mmrError) {
        console.warn('⚠️ MMR search failed, falling back to similarity search:', mmrError);
      }
    }

    if (typeof vectorStore.similaritySearch === 'function') {
      return await vectorStore.similaritySearch(query, k, metadataFilter || undefined);
    }
    const retriever = vectorStore.asRetriever({
      k,
      searchType: 'similarity',
      searchKwargs: {
        filter: metadataFilter || undefined,
      },
    });
    return await retriever.getRelevantDocuments(query);
  } catch (error) {
    console.error('❌ Base retrieval failed:', error);
    return [];
  }
}

/**
 * Query rewriting using LLM
 */
async function rewriteQueries(originalQuery, maxQueries) {
  const llm = getChatModel();
  
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are a query expansion expert. Given a user question, generate ${maxQueries - 1} alternative phrasings that would help find the same information. The alternatives should:
1. Use different terminology/synonyms
2. Ask the same thing from different angles  
3. Include more specific or more general versions
4. Maintain the same intent

Return only the alternative questions, one per line, without numbering or bullets.`],
      ['human', originalQuery]
    ]);

    const response = await llm.invoke(await prompt.format({ input: originalQuery }));
    const alternatives = response.content.toString()
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0)
      .slice(0, maxQueries - 1);

    return [originalQuery, ...alternatives];
  } catch (error) {
    console.error('⚠️ Query rewriting failed:', error);
    return [originalQuery];
  }
}

/**
 * Contextual compression using relevance filtering
 */
async function compressDocuments(query, documents) {
  try {
    const compressedDocs = [];
    const queryTokens = query.toLowerCase().split(/\s+/);
    
    for (const doc of documents) {
      // Calculate relevance score based on keyword overlap
      const docTokens = doc.pageContent.toLowerCase().split(/\s+/);
      const relevanceScore = queryTokens.filter(token => docTokens.includes(token)).length / queryTokens.length;
      
      if (relevanceScore > 0.1) { // Keep documents with some relevance
        // Smart truncation: keep beginning and end of important documents
        const content = doc.pageContent;
        const truncatedContent = content.length > 1000 
          ? content.slice(0, 500) + '\n...\n' + content.slice(-500)
          : content;
          
        compressedDocs.push(new Document({
          pageContent: truncatedContent,
          metadata: { 
            ...doc.metadata, 
            compressionScore: relevanceScore,
            compressed: content.length > 1000
          },
        }));
      }
    }
    
    console.log(`🗜️ Compressed ${documents.length} documents to ${compressedDocs.length}`);
    return compressedDocs.length > 0 ? compressedDocs : documents.slice(0, 3); // Fallback
    
  } catch (error) {
    console.error('⚠️ Contextual compression failed:', error);
    return documents;
  }
}

/**
 * Generate final answer from retrieved context
 */
async function generateAnswer(query, documents) {
  const llm = getChatModel();
  
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are a helpful assistant that answers questions based on the provided context. Use the context to provide accurate, detailed answers. If the context doesn't contain enough information to answer the question, say so clearly.

Context:
{context}

Guidelines:
- Base your answer primarily on the provided context
- Be specific and cite relevant details from the context
- If information is missing or unclear, acknowledge this
- Maintain a helpful and professional tone`],
      ['human', '{question}']
    ]);

    const contextText = documents.map((doc, i) => 
      `Document ${i + 1}:\n${doc.pageContent}`
    ).join('\n\n');
    
    const finalPrompt = await prompt.format({
      question: query,
      context: contextText,
    });

    const result = await llm.invoke(finalPrompt);
    return typeof result.content === 'string' ? result.content : String(result.content);
  } catch (error) {
    console.error('❌ Answer generation failed:', error);
    return 'I apologize, but I encountered an error while generating an answer based on the retrieved context.';
  }
}

/**
 * Remove duplicate documents based on content similarity
 */
function deduplicateDocuments(documents) {
  const seen = new Set();
  return documents.filter(doc => {
    // Create hash based on first 100 characters for deduplication  
    const hash = doc.pageContent.slice(0, 100).replace(/\s+/g, ' ').trim();
    if (seen.has(hash)) {
      return false;
    }
    seen.add(hash);
    return true;
  });
}

/**
 * Get retriever status
 */
export async function getRetrieverStatus() {
  const vectorStore = getVectorStore();
  return {
    vectorStoreReady: !!vectorStore,
    llmAvailable: true,
  };
}
