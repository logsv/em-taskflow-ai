from fastapi import APIRouter, HTTPException, UploadFile, File
from app.services.rag import rag_service
from typing import Optional
from pydantic import BaseModel

router = APIRouter()

class RAGQueryRequest(BaseModel):
    query: str
    enableQueryRewriting: Optional[bool] = False
    enableCompression: Optional[bool] = False
    enableReranking: Optional[bool] = False

@router.post("/query")
async def query_rag(request: RAGQueryRequest):
    try:
        results = await rag_service.query(request.query)
        return {
            "status": "success",
            "data": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-pdf")
async def upload_pdf(pdf: UploadFile = File(...)):
    # This might be redundant if we have a separate upload router, 
    # but the node app has it under /api/agentic-rag/upload-pdf too?
    # Actually the node app has /api/agentic-rag/upload-pdf AND /api/upload-pdf
    # I'll implement the logic here for now or delegate.
    return {"message": "Use /api/upload-pdf for uploading"}
