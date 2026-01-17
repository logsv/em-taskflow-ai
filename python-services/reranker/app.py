from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np
import uvicorn
import torch
import torch.nn.functional as F
from transformers import AutoProcessor, AutoModelForImageTextToText
import logging
import time
from contextlib import asynccontextmanager

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

MODEL_NAME = "Qwen/Qwen3-VL-Embedding-8B"
MODEL_DEVICE = "cpu"
processor = None
model = None


def encode_texts(texts: List[str], normalize: bool) -> np.ndarray:
    global processor, model, MODEL_DEVICE
    if processor is None or model is None:
        raise RuntimeError("Model not loaded")
    if not texts:
        raise ValueError("No texts provided")
    inputs = processor(text=texts, return_tensors="pt", padding=True, truncation=True)
    device = MODEL_DEVICE
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
    hidden = outputs.last_hidden_state
    mask = inputs["attention_mask"].unsqueeze(-1)
    summed = (hidden * mask).sum(dim=1)
    counts = mask.sum(dim=1)
    embeddings = summed / counts.clamp(min=1)
    if normalize:
        embeddings = F.normalize(embeddings, p=2, dim=1)
    return embeddings.cpu().numpy()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, model, MODEL_DEVICE
    try:
        logger.info(f"Loading Qwen3-VL embedding model for reranker: {MODEL_NAME}")
        start_time = time.time()
        MODEL_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        processor = AutoProcessor.from_pretrained(MODEL_NAME)
        model = AutoModelForImageTextToText.from_pretrained(MODEL_NAME)
        model.to(MODEL_DEVICE)
        model.eval()
        load_time = time.time() - start_time
        logger.info(f"Model loaded in {load_time:.2f}s on {MODEL_DEVICE}")
        yield
    except Exception as e:
        logger.error(f"Failed to load Qwen3-VL embedding model for reranker: {e}")
        raise
    finally:
        logger.info("Shutting down reranker service")

app = FastAPI(
    title="Qwen3-VL Embedding Reranker Service",
    description="Reranking using Qwen3-VL-Embedding-8B cosine similarity",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    global model
    loaded = model is not None
    return HealthResponse(
        status="healthy" if loaded else "initializing",
        model_loaded=loaded,
        model_name=MODEL_NAME,
    )


@app.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest):
    global processor, model
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not request.documents:
        raise HTTPException(status_code=400, detail="No documents provided")
    if len(request.documents) > 100:
        raise HTTPException(status_code=400, detail="Too many documents (max 100)")
    try:
        start_time = time.time()
        logger.info(f"Reranking {len(request.documents)} documents for query")
        contents = []
        for doc in request.documents:
            if doc.content:
                if len(doc.content) > 2000:
                    contents.append(doc.content[:2000])
                else:
                    contents.append(doc.content)
            else:
                contents.append("")
        query_embeddings = encode_texts([request.query], True)
        doc_embeddings = encode_texts(contents, True)
        query_vec = query_embeddings[0]
        scores = doc_embeddings @ query_vec
        scored_docs = []
        for i, doc in enumerate(request.documents):
            score_value = float(scores[i])
            scored_doc = Document(
                content=doc.content,
                metadata=doc.metadata,
                score=score_value if request.return_scores else None,
            )
            scored_docs.append((scored_doc, score_value))
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        top_k = min(request.top_k, len(scored_docs))
        reranked = [doc for doc, _ in scored_docs[:top_k]]
        processing_time = time.time() - start_time
        logger.info(f"Reranked documents in {processing_time:.3f}s, returning top {top_k}")
        return RerankResponse(
            reranked_documents=reranked,
            model=MODEL_NAME,
            processing_time=processing_time,
            original_count=len(request.documents),
            returned_count=len(reranked),
        )
    except Exception as e:
        logger.error(f"Reranking failed: {e}")
        raise HTTPException(status_code=500, detail=f"Reranking failed: {str(e)}")


@app.post("/score")
async def score_pairs(
    query: str,
    texts: List[str],
    return_raw_scores: bool = False,
):
    global processor, model
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not texts:
        raise HTTPException(status_code=400, detail="No texts provided")
    try:
        query_embeddings = encode_texts([query], True)
        text_embeddings = encode_texts(texts, True)
        query_vec = query_embeddings[0]
        scores = text_embeddings @ query_vec
        if return_raw_scores:
            return {"scores": scores.tolist()}
        probabilities = 1 / (1 + np.exp(-scores))
        return {"probabilities": probabilities.tolist()}
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")


@app.get("/")
async def root():
    global model
    status = "running" if model is not None else "initializing"
    return {
        "service": "Qwen3-VL-Embedding-Reranker",
        "model": MODEL_NAME,
        "status": status,
        "endpoints": {
            "health": "/health",
            "rerank": "/rerank",
            "score": "/score",
            "docs": "/docs",
        },
    }


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8002,
        reload=False,
        log_level="info",
    )
