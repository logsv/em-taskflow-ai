from typing import List, Optional
from langchain_core.embeddings import Embeddings
from app.services.ml_models import ml_services
import asyncio

class BGEM3Embeddings(Embeddings):
    """
    Embeddings wrapper using internal ML services.
    Compatible with LangChain Embeddings interface.
    """
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        # This is typically synchronous in LangChain, so we call it directly.
        # If running in an async context, LangChain might handle it, but Embeddings base class methods are sync.
        return ml_services.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        return ml_services.embed_query(text)

class BGEReranker:
    """
    Reranker wrapper using internal ML services.
    """
    async def rerank(self, query: str, documents: List[str], top_k: int = 5) -> List[dict]:
        # Run in thread pool to avoid blocking the async event loop
        return await asyncio.to_thread(ml_services.rerank, query, documents, top_k)
