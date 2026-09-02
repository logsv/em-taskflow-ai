/**
 * RAG Retriever module - Advanced retrieval with compression
 * Implements agentic retrieval patterns with query rewriting and retrieval strategy controls
 */

import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ensureLLMReady, getChatModel } from '../llm/index.js';
import { getRagConfig, getRagAdvancedConfig } from '../config.js';
import databaseService from '../db/postgres.js';
import { getTracerCallbacks, createSpan } from '../utils/tracer.js';
import pythonAIServiceClient from '../grpc/client.js';
import { debug, info, warn, error } from '../utils/logger.js';
import { l1ExactCache } from '../cache/l1ExactCache.js';
import { checkSemanticCache, setSemanticCache } from '../cache/semanticCache.js';

/**
 * Baseline retrieval: vector search + answer generation
 */
export async function baselineRetrieve(query, options = {}) {
  const startTime = Date.now();
  const cacheOptions = { domain: options.domain || 'rag', userId: options.userId, repo: options.repo };

  // Tier 0: L1 Exact Cache Check (<2ms)
  const l1Hit = l1ExactCache.get(query, cacheOptions);
  if (l1Hit) {
    return {
      answer: l1Hit.answer,
      sources: l1Hit.sources,
      originalQuery: query,
      executionTime: Date.now() - startTime,
      fromCache: true,
      cacheTier: 'L1_EXACT',
    };
  }

  // Tier 1: L2 Semantic Cache Check with Dual-Gate Verification (<30ms)
  const cached = await checkSemanticCache(query, cacheOptions);
  if (cached) {
    l1ExactCache.set(query, cached.answer, cached.sources, cacheOptions);
    return {
      answer: cached.answer,
      sources: cached.sources,
      originalQuery: query,
      executionTime: Date.now() - startTime,
      fromCache: true,
      cacheTier: 'L2_SEMANTIC',
    };
  }

  const ragConfig = getRagConfig();
  const {
    topK = ragConfig.topK || 6,
    metadataFilter = null,
  } = options;

  try {
    await ensureLLMReady();
    const docs = await baseRetrieve(query, topK * 2, { strategy: 'similarity', metadataFilter });
    // Apply Cross-Encoder Reranking
    const rerankedDocs = await pythonAIServiceClient.rerankChunks(query, docs, topK);
    const answer = await generateAnswer(query, rerankedDocs, options);
    
    l1ExactCache.set(query, answer, rerankedDocs, cacheOptions);
    await setSemanticCache(query, answer, rerankedDocs, cacheOptions);

    const executionTime = Date.now() - startTime;

    return {
      answer,
      sources: rerankedDocs,
      originalQuery: query,
      executionTime,
    };
  } catch (err) {
    const executionTime = Date.now() - startTime;
    error({ module: 'retriever', action: 'baselineRetrieve', err }, 'Baseline retrieval failed');
    return {
      answer: `I encountered an error during retrieval: ${err.message}`,
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
  const cacheOptions = { domain: options.domain || 'rag', userId: options.userId, repo: options.repo };

  // Tier 0: L1 Exact Cache Check (<2ms)
  const l1Hit = l1ExactCache.get(query, cacheOptions);
  if (l1Hit) {
    info('Agentic retrieval completed from L1 exact cache', { querySnippet: query.slice(0, 50) });
    return {
      answer: l1Hit.answer,
      sources: l1Hit.sources,
      originalQuery: query,
      rewrittenQueries: [query],
      relevanceScores: [],
      compressionApplied: false,
      executionTime: Date.now() - startTime,
      fromCache: true,
      cacheTier: 'L1_EXACT',
    };
  }

  // Tier 1: L2 Semantic Cache Check with Dual-Gate Verification (<30ms)
  const cached = await checkSemanticCache(query, cacheOptions);
  if (cached) {
    l1ExactCache.set(query, cached.answer, cached.sources, cacheOptions);
    info('Agentic retrieval completed from semantic cache', { querySnippet: query.slice(0, 50) });
    return {
      answer: cached.answer,
      sources: cached.sources,
      originalQuery: query,
      rewrittenQueries: [query],
      relevanceScores: [],
      compressionApplied: false,
      executionTime: Date.now() - startTime,
      fromCache: true,
      cacheTier: 'L2_SEMANTIC',
    };
  }

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
    info('Agentic retrieval started', { querySnippet: query.slice(0, 50) });

    // Step 1: Query rewriting and expansion
    let queries = [query];
    const enableHyDE = options.enableHyDE !== undefined ? options.enableHyDE : true;
    
    if (enableQueryRewriting) {
      queries = await rewriteQueries(query, maxQueries, options);
      info('Generated query variants', { queryCount: queries.length });
    }

    if (enableHyDE) {
      const hydeDoc = await generateHypotheticalDocument(query, options);
      if (hydeDoc) {
        queries.push(hydeDoc);
        info('Generated HyDE document and added to queries');
      }
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
    info('Deduplicated documents retrieved', { totalDocs: allDocuments.length, uniqueDocsCount: uniqueDocs.length });

    // Step 3: Cross-Encoder Reranking to eliminate hallucinations
    let rankedDocs = await pythonAIServiceClient.rerankChunks(query, uniqueDocs, topK);

    // Step 4: Contextual compression
    let finalDocs = rankedDocs;
    if (enableCompression) {
      finalDocs = await compressDocuments(query, rankedDocs, options);
      info('Applied contextual compression to retrieved documents');
    }

    // Step 5: Generate answer
    const answer = await generateAnswer(query, finalDocs, options);

    l1ExactCache.set(query, answer, finalDocs, cacheOptions);
    await setSemanticCache(query, answer, finalDocs, cacheOptions);

    const executionTime = Date.now() - startTime;
    info('Agentic retrieval completed', { docsRetrieved: finalDocs.length, executionTimeMs: executionTime });

    return {
      answer,
      sources: finalDocs,
      originalQuery: query,
      rewrittenQueries: queries,
      relevanceScores: finalDocs.map((doc) => doc.metadata?.compressionScore ?? null),
      compressionApplied: enableCompression,
      executionTime,
    };

  } catch (err) {
    error('Agentic retrieval failed', { querySnippet: query.slice(0, 50), err: err.message });
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
  } catch (err) {
    error({ module: 'retriever', action: 'simpleRetrieve', err }, 'Simple retrieval failed');
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
  const { metadataFilter = null, preferChildChunk = false } = options;
  const span = createSpan(options.trace, 'PostgreSQL Hybrid Search', { query, topK: k });

  try {
    const pgResults = await databaseService.hybridSearchPdfChunks({
      query,
      embedding: null,
      topK: k,
      metadataFilter,
    });

    if (Array.isArray(pgResults) && pgResults.length > 0) {
      debug({ module: 'retriever', action: 'hybridSearch', chunkCount: pgResults.length, querySnippet: query.slice(0, 50) }, `PostgreSQL Hybrid Search retrieved ${pgResults.length} chunk(s)`);
      span.end({
        output: {
          chunkCount: pgResults.length,
          chunks: pgResults.map((c) => ({ id: c.id, score: c.score, filename: c.filename })),
        },
      });
      return pgResults.map((item) => new Document({
        pageContent: preferChildChunk ? item.content : (item.parentContent || item.content),
        metadata: {
          filename: item.filename,
          documentId: item.documentId,
          chunkIndex: item.chunkIndex,
          hybridScore: item.score,
        },
      }));
    }
    span.end({ output: { chunkCount: 0 } });
  } catch (pgErr) {
    span.end({ output: { error: pgErr.message } });
    warn({ module: 'retriever', action: 'hybridSearchFallback', err: pgErr }, 'PostgreSQL hybrid retrieval failed');
  }

  return [];
}

/**
 * Query rewriting using LLM
 */
async function rewriteQueries(originalQuery, maxQueries = 3, options = {}) {
  const llm = getChatModel();
  const callbacks = getTracerCallbacks(options);
  
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

    const response = await llm.invoke(await prompt.format({ input: originalQuery }), { callbacks });
    const alternatives = response.content.toString()
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0)
      .slice(0, maxQueries - 1);

    return [originalQuery, ...alternatives];
  } catch (err) {
    warn({ module: 'retriever', action: 'rewriteQueries', err }, 'Query rewriting failed, falling back to original query');
    return [originalQuery];
  }
}

/**
 * Contextual compression using relevance filtering
 */
async function compressDocuments(query, documents, options = {}) {
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
    
    debug({ module: 'retriever', action: 'compressDocuments', initialCount: documents.length, compressedCount: compressedDocs.length }, `Compressed ${documents.length} documents to ${compressedDocs.length}`);
    return compressedDocs.length > 0 ? compressedDocs : documents.slice(0, 3); // Fallback
    
  } catch (err) {
    warn({ module: 'retriever', action: 'compressDocumentsFallback', err }, 'Contextual compression failed');
    return documents;
  }
}

/**
 * Generate final answer from retrieved context
 */
async function generateAnswer(query, documents, options = {}) {
  const llm = getChatModel();
  const callbacks = getTracerCallbacks(options);

  if (!Array.isArray(documents) || documents.length === 0) {
    return 'I cannot find information about this in the uploaded documents.';
  }
  
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are an expert AI document assistant analyzing uploaded PDF files.

INSTRUCTIONS:
1. Carefully read and synthesize all facts, guidelines, criteria, and details from the provided Context.
2. Structure your answer clearly using the following section headers:
   - ### 📄 Executive Summary
   - ### 🔍 Key Document Analysis & Rubric Guidelines
   - ### 📌 Source Citations
3. Highlight key rules, rubric criteria, evaluation steps, or bullet points found in the document.
4. Always cite the document source (e.g. [Document: filename.pdf]).

Retrieved Document Context:
{context}`],
      ['human', '{question}']
    ]);

    const contextText = documents.map((doc, i) => 
      `--- Document ${i + 1} (${doc.metadata?.filename || 'File'}): ---\n${doc.pageContent}`
    ).join('\n\n');
    
    const finalPrompt = await prompt.format({
      question: query,
      context: contextText,
    });

    const result = await llm.invoke(finalPrompt, { callbacks });
    return typeof result.content === 'string' ? result.content : String(result.content);
  } catch (err) {
    error({ module: 'retriever', action: 'generateAnswer', err }, 'Answer generation failed');
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

/**
 * Generate a hypothetical document for HyDE retrieval
 */
async function generateHypotheticalDocument(query, options = {}) {
  const llm = getChatModel();
  const callbacks = getTracerCallbacks(options);
  
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `Given the following question, write a brief passage (~150 words) that would directly answer this question as if it were found in an authoritative document. Do not include any preamble or explanation, just write the passage itself.

Question: {query}`]
    ]);

    const finalPrompt = await prompt.format({ query });
    const result = await llm.invoke(finalPrompt, { callbacks });
    return typeof result.content === 'string' ? result.content : String(result.content);
  } catch (err) {
    warn({ module: 'retriever', action: 'generateHypotheticalDocumentFallback', err }, 'HyDE generation failed');
    return null;
  }
}
