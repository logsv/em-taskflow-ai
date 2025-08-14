
import { ChromaClient } from 'chromadb';
import type { Collection, CollectionMetadata, Metadata } from 'chromadb';
import { config, getVectorDbConfig } from '../config.js';

// Modern ChromaDB client configuration
const getClient = (): ChromaClient => {
  const vectorDbConfig = getVectorDbConfig();
  return new ChromaClient({
    host: vectorDbConfig.chroma.host,
    port: vectorDbConfig.chroma.port
  });
};

export const createCollection = async (collectionName: string, metadata?: CollectionMetadata): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const client = getClient();
    
    // Try to get the collection first to check if it exists
    try {
      await client.getCollection({ name: collectionName });
      return { success: true, message: `Collection '${collectionName}' already exists` };
    } catch (error) {
      // Collection doesn't exist, create it
    }

    // Create new collection with no embedding function (we'll provide embeddings directly)  
    // According to ChromaDB docs, we can provide embeddings directly without an embedding function
    await client.createCollection({
      name: collectionName,
      metadata: metadata || { description: "PDF document chunks for RAG search" }
      // No embeddingFunction specified - we'll provide embeddings directly to add() and query()
    });
    
    return { success: true, message: `Collection '${collectionName}' created successfully` };
  } catch (e: any) {
    console.warn('⚠️ ChromaDB createCollection failed:', e.message);
    return { success: false, error: e.message };
  }
};

export const addDocuments = async (collectionName: string, documents: string[], metadatas: Metadata[], ids: string[], embeddings: number[][]): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const client = getClient();
    const collection = await client.getCollection({ name: collectionName });
    await collection.add({
      ids,
      embeddings,
      metadatas,
      documents,
    });
    return { success: true, message: `Added ${documents.length} documents to '${collectionName}'` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const queryCollection = async (collectionName: string, queryEmbeddings: number[][], nResults: number = 5): Promise<{ success: boolean; results?: any; error?: string }> => {
  try {
    const client = getClient();
    const collection = await client.getCollection({ name: collectionName });
    const results = await collection.query({
      queryEmbeddings,
      nResults,
    });
    return { success: true, results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const listCollections = async (): Promise<{ success: boolean; collections?: Collection[]; error?: string }> => {
  try {
    const client = getClient();
    
    // Use modern API - listCollections returns Collection objects directly
    const collections = await client.listCollections();
    
    return { success: true, collections };
  } catch (e: any) {
    console.warn('⚠️ ChromaDB listCollections failed:', e.message);
    return { success: false, error: e.message };
  }
};
