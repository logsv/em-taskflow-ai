/**
 * RAG Retriever module - Advanced retrieval with compression
 * Implements agentic retrieval patterns with query rewriting and retrieval strategy controls
 */

import { Document } from 'langchain/document';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { getVectorStore, getChromaClient } from './ingest.js';
import { ensureLLMReady, getChatModel } from '../llm/index.js';
import { getRagConfig, getRagAdvancedConfig } from '../config.js';

// Retrieval configuration
const MAX_RETRIEVAL_K = 30; // Initial retrieval
let loggedChromaEmbeddingBug = false;

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
 * Base retrieval from vector store
 */
async function baseRetrieve(query, k, options = {}) {
  const vectorStore = getVectorStore();
  if (!vectorStore) {
    throw new Error('Vector store not initialized');
  }

  const { metadataFilter = null } = options;

  try {
    const chromaClient = getChromaClient();
    if (!chromaClient) {
      throw new Error('ChromaDB client not initialized');
    }

    const embeddingModel = vectorStore?.embeddings;
    if (!embeddingModel || typeof embeddingModel.embedQuery !== 'function') {
      throw new Error('Vector store embeddings not available for query');
    }

    const queryEmbedding = await embeddingModel.embedQuery(query);
    const normalizedEmbedding = normalizeEmbedding(queryEmbedding);
    if (normalizedEmbedding.length === 0) {
      throw new Error('Failed to generate valid query embedding');
    }

    const ragConfig = getRagConfig();
    const collectionName = ragConfig.defaultCollection || 'pdf_chunks';
    const collection = await chromaClient.getCollection({ name: collectionName });

    const result = await collection.query({
      queryEmbeddings: [normalizedEmbedding],
      nResults: k,
      where: metadataFilter && typeof metadataFilter === 'object' ? metadataFilter : undefined,
      include: ['documents', 'metadatas', 'distances'],
    });

    const docs = Array.isArray(result?.documents?.[0]) ? result.documents[0] : [];
    const metadatas = Array.isArray(result?.metadatas?.[0]) ? result.metadatas[0] : [];

    return docs.map((content, idx) => new Document({
      pageContent: String(content || ''),
      metadata: metadatas[idx] || {},
    }));
  } catch (error) {
    const message = error?.message || '';
    if (message.includes('e.every is not a function')) {
      if (!loggedChromaEmbeddingBug) {
        console.warn('⚠️ Chroma vector query failed (known embedding validation issue); using lexical fallback retrieval.');
        loggedChromaEmbeddingBug = true;
      }
    } else {
      console.error('❌ Base retrieval failed, using lexical fallback:', error);
    }
    return await lexicalFallbackRetrieve(query, k, metadataFilter);
  }
}

function normalizeEmbedding(vector) {
  if (ArrayBuffer.isView(vector)) {
    return Array.from(vector).map(Number).filter((n) => Number.isFinite(n));
  }
  if (!Array.isArray(vector)) {
    return [];
  }

  const base = Array.isArray(vector[0]) ? vector[0] : vector;
  if (ArrayBuffer.isView(base)) {
    return Array.from(base).map(Number).filter((n) => Number.isFinite(n));
  }
  if (!Array.isArray(base)) {
    return [];
  }

  return base.map(Number).filter((n) => Number.isFinite(n));
}

async function lexicalFallbackRetrieve(query, k, metadataFilter = null) {
  try {
    const chromaClient = getChromaClient();
    if (!chromaClient) {
      return [];
    }

    const ragConfig = getRagConfig();
    const collectionName = ragConfig.defaultCollection || 'pdf_chunks';
    const collection = await chromaClient.getCollection({ name: collectionName });

    const where = metadataFilter && typeof metadataFilter === 'object' ? metadataFilter : undefined;
    const data = await collection.get({
      where,
      include: ['documents', 'metadatas'],
    });

    const docs = Array.isArray(data.documents) ? data.documents : [];
    const metadatas = Array.isArray(data.metadatas) ? data.metadatas : [];
    if (docs.length === 0) {
      return [];
    }

    const queryTokens = new Set(tokenize(query));
    const scored = docs
      .map((content, idx) => {
        const tokens = tokenize(content || '');
        let overlap = 0;
        for (const token of tokens) {
          if (queryTokens.has(token)) overlap += 1;
        }
        const norm = queryTokens.size > 0 ? overlap / queryTokens.size : 0;
        return {
          score: norm,
          doc: new Document({
            pageContent: content || '',
            metadata: metadatas[idx] || {},
          }),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((item) => item.doc);

    return scored;
  } catch (error) {
    console.error('❌ Lexical fallback retrieval failed:', error);
    return [];
  }
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
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
