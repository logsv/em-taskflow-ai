from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil
import os
from app.core.config import settings
from app.services.rag import rag_service

router = APIRouter()

@router.post("/upload-pdf")
async def upload_file(pdf: UploadFile = File(...)):
    try:
        # Save file
        pdf_dir = os.path.join(os.path.dirname(settings.DATABASE_PATH), "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        
        file_path = os.path.join(pdf_dir, pdf.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(pdf.file, buffer)
            
        # Process with RAG
        chunks = await rag_service.ingest_pdf(file_path, pdf.filename)
        
        return {
            "status": "success",
            "message": f"PDF processed successfully. Created {chunks} chunks.",
            "chunks": chunks,
            "filename": pdf.filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
