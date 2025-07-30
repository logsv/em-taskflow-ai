
import { ChromaClient } from 'chromadb';
import type { Collection, CollectionMetadata, Metadata, ChromaClientArgs } from 'chromadb';

const getClient = (params?: ChromaClientArgs): ChromaClient => {
  // The default host is 'localhost' and port is 8000, which matches the python script.
  return new ChromaClient(params);
};

export const createCollection = async (collectionName: string, metadata?: CollectionMetadata): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const client = getClient();
    const existingCollections = await client.listCollections();
    if (existingCollections.map((c: Collection) => c.name).includes(collectionName)) {
      return { success: true, message: `Collection '${collectionName}' already exists` };
    }

    await client.createCollection({
      name: collectionName,
      metadata: metadata || { description: "PDF document chunks for RAG search" },
    });
    return { success: true, message: `Collection '${collectionName}' created successfully` };
  } catch (e: any) {
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
    const collections = await client.listCollections();
    return { success: true, collections };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};
