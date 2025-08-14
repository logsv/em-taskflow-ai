/**
 * RAG Retriever module - Advanced retrieval with reranking and compression
 * Implements agentic retrieval patterns with BGE reranking and contextual compression
 */

import { Document } from 'langchain/document';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { getVectorStore } from './ingest.js';
import { getChatOllama, getBgeReranker } from '../llm/index.js';

// Retrieval configuration
const MAX_RETRIEVAL_K = 30; // Initial retrieval
const FINAL_K = 8; // Final results after reranking
const MMR_LAMBDA = 0.7; // Balance between relevance and diversity

export interface RetrievalResult {
  answer: string;
  sources: Document[];
  originalQuery: string;
  rewrittenQueries: string[];
  relevanceScores: number[];
  compressionApplied: boolean;
  reranked: boolean;
  executionTime: number;
}

export interface RetrievalOptions {
  enableQueryRewriting?: boolean;
  enableCompression?: boolean;  
  enableReranking?: boolean;
  maxQueries?: number;
  topK?: number;
}

/**
 * Perform agentic retrieval with query rewriting, reranking, and compression
 */
export async function agenticRetrieve(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const {
    enableQueryRewriting = true,
    enableCompression = true,
    enableReranking = true,
    maxQueries = 3,
    topK = FINAL_K
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
    const allDocuments: Document[] = [];
    for (const q of queries) {
      const docs = await baseRetrieve(q, MAX_RETRIEVAL_K);
      allDocuments.push(...docs);
    }

    // Remove duplicates
    const uniqueDocs = deduplicateDocuments(allDocuments);
    console.log(`📋 Retrieved ${uniqueDocs.length} unique documents from ${allDocuments.length} total`);

    // Step 3: Reranking with BGE cross-encoder
    let rankedDocs = uniqueDocs;
    if (enableReranking) {
      rankedDocs = await rerankDocuments(query, uniqueDocs, topK);
      console.log(`📊 Reranked to top ${rankedDocs.length} documents`);
    } else {
      rankedDocs = uniqueDocs.slice(0, topK);
    }

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
      relevanceScores: finalDocs.map(() => 0.85), // Placeholder scores
      compressionApplied: enableCompression,
      reranked: enableReranking,
      executionTime,
    };

  } catch (error) {
    console.error('❌ Agentic retrieval failed:', error);
    const executionTime = Date.now() - startTime;
    
    return {
      answer: `I encountered an error during retrieval: ${(error as Error).message}`,
      sources: [],
      originalQuery: query,
      rewrittenQueries: [query],
      relevanceScores: [],
      compressionApplied: false,
      reranked: false,
      executionTime,
    };
  }
}

/**
 * Simple retrieval for backward compatibility
 */
export async function simpleRetrieve(query: string, topK = 5): Promise<{
  chunks: any[];
  sources: string[];
  context: string;
}> {
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
async function baseRetrieve(query: string, k: number): Promise<Document[]> {
  const vectorStore = getVectorStore();
  if (!vectorStore) {
    throw new Error('Vector store not initialized');
  }

  try {
    const retriever = vectorStore.asRetriever({
      k,
      searchType: 'mmr', // Maximum Marginal Relevance for diversity
      searchKwargs: {
        lambda: MMR_LAMBDA, // Balance relevance vs diversity
      }
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
async function rewriteQueries(originalQuery: string, maxQueries: number): Promise<string[]> {
  const llm = getChatOllama();
  
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
 * Rerank documents using BGE reranker or fallback
 */
async function rerankDocuments(query: string, documents: Document[], topK: number): Promise<Document[]> {
  const bgeReranker = getBgeReranker();
  
  try {
    // Try BGE reranker first
    const rerankerAvailable = await bgeReranker.isAvailable();
    if (rerankerAvailable) {
      const rerankerDocs = documents.map(doc => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      }));
      
      const result = await bgeReranker.rerank(query, rerankerDocs, topK, true);
      
      return result.reranked_documents.map(rankedDoc => new Document({
        pageContent: rankedDoc.content,
        metadata: rankedDoc.metadata || {},
      }));
    } else {
      throw new Error('BGE reranker not available');
    }
  } catch (error) {
    console.warn('⚠️ BGE reranker failed, using lexical fallback:', error);
    
    // Fallback to lexical similarity reranking
    return lexicalRerank(query, documents, topK);
  }
}

/**
 * Fallback lexical reranking
 */
function lexicalRerank(query: string, documents: Document[], topK: number): Document[] {
  const queryTokens = query.toLowerCase().split(/\s+/);
  
  const scored = documents.map(doc => {
    const docText = doc.pageContent.toLowerCase();
    const matchCount = queryTokens.filter(token => docText.includes(token)).length;
    const score = matchCount / queryTokens.length;
    return { doc, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => item.doc);
}

/**
 * Contextual compression using relevance filtering
 */
async function compressDocuments(query: string, documents: Document[]): Promise<Document[]> {
  try {
    const compressedDocs: Document[] = [];
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
async function generateAnswer(query: string, documents: Document[]): Promise<string> {
  const llm = getChatOllama();
  
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
function deduplicateDocuments(documents: Document[]): Document[] {
  const seen = new Set<string>();
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
export async function getRetrieverStatus(): Promise<{
  vectorStoreReady: boolean;
  bgeRerankerAvailable: boolean;
  llmAvailable: boolean;
}> {
  const vectorStore = getVectorStore();
  const bgeReranker = getBgeReranker();
  
  let bgeAvailable = false;
  try {
    bgeAvailable = await bgeReranker.isAvailable();
  } catch (error) {
    // BGE not available
  }
  
  return {
    vectorStoreReady: !!vectorStore,
    bgeRerankerAvailable: bgeAvailable,
    llmAvailable: true, // Ollama should always be available
  };
}