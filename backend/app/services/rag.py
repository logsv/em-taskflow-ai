import os
from typing import List, Optional
from fastapi import UploadFile
import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import TokenTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from app.core.config import settings
from app.services.llm_utils import BGEM3Embeddings

class RAGService:
    def __init__(self):
        self.embeddings = BGEM3Embeddings() # Add fallback logic if needed
        self.chroma_client = chromadb.HttpClient(
            host=settings.CHROMA_HOST, 
            port=settings.CHROMA_PORT
        )
        self.collection_name = settings.RAG_DEFAULT_COLLECTION
        self.vector_store = Chroma(
            client=self.chroma_client,
            collection_name=self.collection_name,
            embedding_function=self.embeddings,
            collection_metadata={
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 200,
                "hnsw:M": 16,
                "hnsw:search_ef": 100,
            }
        )
        self.text_splitter = TokenTextSplitter(
            chunk_size=settings.RAG_MAX_CHUNK_SIZE,
            chunk_overlap=150
        )

    async def ingest_pdf(self, file_path: str, filename: str) -> int:
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        
        # Add metadata
        for doc in documents:
            doc.metadata["source"] = filename
            doc.metadata["filename"] = filename
            
        chunks = self.text_splitter.split_documents(documents)
        
        if chunks:
            self.vector_store.add_documents(chunks)
            
        return len(chunks)

    async def query(self, query: str, k: int = 5) -> List[dict]:
        docs = self.vector_store.similarity_search_with_score(query, k=k)
        results = []
        for doc, score in docs:
            results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": score
            })
        return results

rag_service = RAGService()
