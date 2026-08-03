/**
 * RAG Retriever module - Advanced retrieval with compression
 * Implements agentic retrieval patterns with query rewriting and retrieval strategy controls
 */

import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ensureLLMReady, getChatModel } from '../llm/index.js';
import { getRagConfig, getRagAdvancedConfig } from '../config.js';
import databaseService from '../db/postgres.js';

// Retrieval configuration
const MAX_RETRIEVAL_K = 30; // Initial retrieval

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
    await ensureLLMReady();
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
    await ensureLLMReady();
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
 * Base retrieval from PostgreSQL vector + tsvector store
 */
async function baseRetrieve(query, k, options = {}) {
  const { metadataFilter = null } = options;

  try {
    const pgResults = await databaseService.hybridSearchPdfChunks({
      query,
      embedding: null,
      topK: k,
      metadataFilter,
    });

    if (Array.isArray(pgResults) && pgResults.length > 0) {
      console.log(`🗄️ PostgreSQL Hybrid Search retrieved ${pgResults.length} chunk(s) for query: "${query.slice(0, 50)}..."`);
      return pgResults.map((item) => new Document({
        pageContent: item.parentContent || item.content,
        metadata: {
          filename: item.filename,
          documentId: item.documentId,
          chunkIndex: item.chunkIndex,
          hybridScore: item.score,
        },
      }));
    }
  } catch (pgErr) {
    console.warn(`⚠️ PostgreSQL hybrid retrieval failed (${pgErr.message})`);
  }

  return [];
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

  if (!Array.isArray(documents) || documents.length === 0) {
    return 'I cannot find information about this in the uploaded documents.';
  }
  
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are a strictly factual RAG assistant. Your top directive is ZERO HALLUCINATION.

CRITICAL GROUNDING DIRECTIVES:
1. Answer ONLY using facts explicitly stated in the Context below.
2. Do NOT invent, assume, extrapolate, or bring in outside knowledge.
3. If the provided Context does NOT contain the necessary information to answer the question, respond EXACTLY:
   "I cannot find information about this in the uploaded documents."
4. Include exact document source citations for every claim (e.g. [Document: filename.pdf]).

Context:
{context}`],
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
  return {
    vectorStoreReady: true,
    llmAvailable: true,
  };
}
