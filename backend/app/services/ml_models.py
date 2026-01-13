import logging
import time
from typing import List, Dict, Any, Optional
from sentence_transformers import CrossEncoder, SentenceTransformer
import torch
import numpy as np

logger = logging.getLogger(__name__)

class MLServices:
    _instance = None
    _reranker = None
    _embedding_model = None
    
    # Models
    RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"
    EMBEDDING_MODEL = "BAAI/bge-m3"

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = MLServices()
        return cls._instance

    def load_models(self):
        """Load models on startup"""
        try:
            logger.info("⏳ Loading ML models...")
            start_time = time.time()
            
            # Load Reranker
            logger.info(f"Loading Reranker: {self.RERANKER_MODEL}")
            self._reranker = CrossEncoder(self.RERANKER_MODEL, max_length=1024)
            
            # Load Embeddings
            logger.info(f"Loading Embedding Model: {self.EMBEDDING_MODEL}")
            self._embedding_model = SentenceTransformer(self.EMBEDDING_MODEL)
            
            load_time = time.time() - start_time
            logger.info(f"✅ ML models loaded successfully in {load_time:.2f}s")
            
        except Exception as e:
            logger.error(f"❌ Failed to load ML models: {e}")
            # Fallback to smaller models if needed? 
            # For now, let's propagate error or just log it.
            # Reranker fallback logic from original service:
            try:
                logger.info("Attempting fallback to smaller reranker...")
                self._reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)
                logger.info("✅ Fallback reranker loaded")
            except Exception as fallback_e:
                logger.error(f"❌ Fallback failed: {fallback_e}")
                
            # Embeddings fallback
            try:
                if self._embedding_model is None:
                    logger.info("Attempting fallback to smaller embedding model...")
                    self._embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
                    logger.info("✅ Fallback embedding model loaded")
            except Exception as fallback_e:
                logger.error(f"❌ Fallback embedding failed: {fallback_e}")

    def rerank(self, query: str, documents: List[str], top_k: int = 5) -> List[Dict[str, Any]]:
        """Rerank documents based on query"""
        if not self._reranker:
            logger.warning("Reranker model not loaded")
            return []
            
        try:
            pairs = [[query, doc] for doc in documents]
            scores = self._reranker.predict(pairs)
            
            # Combine docs with scores
            results = []
            for i, score in enumerate(scores):
                results.append({
                    "text": documents[i],
                    "score": float(score),
                    "index": i
                })
            
            # Sort by score descending
            results.sort(key=lambda x: x["score"], reverse=True)
            
            return results[:top_k]
        except Exception as e:
            logger.error(f"Error in reranking: {e}")
            return []

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for documents"""
        if not self._embedding_model:
            logger.warning("Embedding model not loaded")
            return []
            
        try:
            embeddings = self._embedding_model.encode(texts, normalize_embeddings=True)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Error in embedding documents: {e}")
            return []

    def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query"""
        if not self._embedding_model:
            logger.warning("Embedding model not loaded")
            return []
            
        try:
            embedding = self._embedding_model.encode(text, normalize_embeddings=True)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error in embedding query: {e}")
            return []

# Global instance
ml_services = MLServices.get_instance()
