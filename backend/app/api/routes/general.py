from fastapi import APIRouter, HTTPException, UploadFile, File
from app.services.agent import agent_service
from app.services.rag import rag_service
from pydantic import BaseModel
from typing import Optional, List
import shutil
import os
from app.core.config import settings

router = APIRouter()

# Models
class RAGQueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5

class LLMSummaryRequest(BaseModel):
    prompt: str
    sessionId: Optional[str] = None

class CompleteTaskRequest(BaseModel):
    taskType: str
    taskId: str
    note: str

# Endpoints matching Node.js api.ts

@router.post("/upload-pdf")
async def upload_pdf(pdf: UploadFile = File(...)):
    try:
        pdf_dir = os.path.join(os.path.dirname(settings.DATABASE_PATH), "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        file_path = os.path.join(pdf_dir, pdf.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(pdf.file, buffer)
        
        chunks = await rag_service.ingest_pdf(file_path, pdf.filename)
        return {
            "status": "success", 
            "message": f"PDF processed successfully. Created {chunks} chunks.",
            "chunks": chunks,
            "filename": pdf.filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag-query")
async def rag_query(request: RAGQueryRequest):
    try:
        # The Node.js version seems to use the Agent service for this now,
        # despite the name "rag-query". Or it combines them.
        # Given the frontend expects "answer" and "sources", we should return that format.
        
        # If we use the agent:
        response = await agent_service.process_query(request.query)
        # Assuming agent returns a string or dict.
        # If string, we wrap it.
        answer = str(response)
        
        # We might want to fetch sources separately or extract them
        sources = [] 
        
        return {
            "answer": answer,
            "sources": sources,
            "timestamp": "now"
        }
    except Exception as e:
        print(f"Error in rag-query: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/llm-summary")
async def llm_summary(request: LLMSummaryRequest):
    try:
        response = await agent_service.process_query(request.prompt)
        return {
            "response": str(response),
            "message": "Response generated using integrated RAG, MCP, and LLM agent",
            "timestamp": "now"
        }
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@router.get("/suggestions")
async def get_suggestions(sessionId: Optional[str] = None):
    return {
        "suggestions": [
            'Review pending tasks', 
            'Check calendar conflicts', 
            'Update project status'
        ]
    }

@router.get("/summary")
async def get_summary():
    # Placeholder for TaskManager summary
    return {
        "jira": [],
        "notion": [],
        "notionUpdates": {},
        "calendar": [],
        "calendarConflicts": []
    }

@router.post("/complete")
async def complete_task(request: CompleteTaskRequest):
    # Placeholder for completing tasks
    return {"success": True}

