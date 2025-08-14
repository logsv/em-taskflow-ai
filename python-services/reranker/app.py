"""
BGE-Reranker-v2-M3 Cross-Encoder Microservice
Provides high-quality document reranking for RAG systems
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np
import uvicorn
from sentence_transformers import CrossEncoder
import logging
import time
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Document(BaseModel):
    content: str
    metadata: Dict[str, Any] = {}
    score: Optional[float] = None

class RerankRequest(BaseModel):
    query: str
    documents: List[Document]
    top_k: int = 8
    return_scores: bool = True

class RerankResponse(BaseModel):
    reranked_documents: List[Document]
    model: str
    processing_time: float
    original_count: int
    returned_count: int

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str

# Global model variable
reranker = None
MODEL_NAME = "BAAI/bge-reranker-v2-m3"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup"""
    global reranker
    try:
        logger.info(f"Loading BGE-Reranker-v2-M3 model: {MODEL_NAME}")
        start_time = time.time()
        
        # Load BGE-Reranker-v2-M3 cross-encoder
        reranker = CrossEncoder(MODEL_NAME, max_length=1024)
        
        load_time = time.time() - start_time
        logger.info(f"✅ BGE-Reranker model loaded successfully in {load_time:.2f}s")
        
        yield
    except Exception as e:
        logger.error(f"❌ Failed to load BGE-Reranker model: {e}")
        # Fallback to a smaller model if the main one fails
        try:
            logger.info("Attempting fallback to smaller reranker model...")
            reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)
            logger.info("✅ Fallback reranker model loaded")
            yield
        except Exception as fallback_error:
            logger.error(f"❌ Fallback model also failed: {fallback_error}")
            raise
    finally:
        logger.info("Shutting down reranker service")

app = FastAPI(
    title="BGE-Reranker-v2-M3 Service",
    description="High-quality cross-encoder reranking using BGE-Reranker-v2-M3",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    global reranker
    
    return HealthResponse(
        status="healthy" if reranker is not None else "initializing",
        model_loaded=reranker is not None,
        model_name=MODEL_NAME
    )

@app.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest):
    """Rerank documents based on query relevance"""
    global reranker
    
    if reranker is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not request.documents:
        raise HTTPException(status_code=400, detail="No documents provided")
    
    if len(request.documents) > 100:
        raise HTTPException(status_code=400, detail="Too many documents (max 100)")
    
    try:
        start_time = time.time()
        logger.info(f"🔄 Reranking {len(request.documents)} documents for query")
        
        # Prepare query-document pairs for the cross-encoder
        pairs = []
        for doc in request.documents:
            # Truncate document content to avoid token limits
            content = doc.content[:2000] if len(doc.content) > 2000 else doc.content
            pairs.append([request.query, content])
        
        # Get relevance scores from cross-encoder
        scores = reranker.predict(pairs)
        
        # Create scored documents
        scored_docs = []
        for i, doc in enumerate(request.documents):
            scored_doc = Document(
                content=doc.content,
                metadata=doc.metadata,
                score=float(scores[i]) if request.return_scores else None
            )
            scored_docs.append((scored_doc, scores[i]))
        
        # Sort by relevance score (descending)
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        
        # Return top-k documents
        top_k = min(request.top_k, len(scored_docs))
        reranked = [doc for doc, score in scored_docs[:top_k]]
        
        processing_time = time.time() - start_time
        logger.info(f"✅ Reranked documents in {processing_time:.3f}s, returning top {top_k}")
        
        return RerankResponse(
            reranked_documents=reranked,
            model=MODEL_NAME,
            processing_time=processing_time,
            original_count=len(request.documents),
            returned_count=len(reranked)
        )
        
    except Exception as e:
        logger.error(f"❌ Reranking failed: {e}")
        raise HTTPException(status_code=500, detail=f"Reranking failed: {str(e)}")

@app.post("/score")
async def score_pairs(
    query: str,
    texts: List[str],
    return_raw_scores: bool = False
):
    """Score query-text pairs directly"""
    global reranker
    
    if reranker is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not texts:
        raise HTTPException(status_code=400, detail="No texts provided")
    
    try:
        pairs = [[query, text] for text in texts]
        scores = reranker.predict(pairs)
        
        if return_raw_scores:
            return {"scores": scores.tolist()}
        else:
            # Apply sigmoid to get probabilities
            probabilities = 1 / (1 + np.exp(-scores))
            return {"probabilities": probabilities.tolist()}
            
    except Exception as e:
        logger.error(f"❌ Scoring failed: {e}")
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "BGE-Reranker-v2-M3",
        "model": MODEL_NAME,
        "status": "running" if reranker else "initializing",
        "endpoints": {
            "health": "/health",
            "rerank": "/rerank",
            "score": "/score",
            "docs": "/docs"
        }
    }

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8002,
        reload=False,
        log_level="info"
    )