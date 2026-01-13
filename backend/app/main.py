from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import agent, rag, upload, general
from app.services.ml_models import ml_services

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load ML models on startup
    # We can run this in a separate thread if it takes too long, 
    # but for startup it's usually fine to block briefly or use run_in_executor
    import asyncio
    await asyncio.to_thread(ml_services.load_models)
    yield
    # Cleanup if needed

app = FastAPI(title="EM TaskFlow API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
# The structure in Node.js is:
# /api/agent -> agentRouter
# /api/agentic-rag -> agenticRagRouter
# /api -> general router (which handles /rag-query, /upload-pdf etc)

app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(rag.router, prefix="/api/agentic-rag", tags=["rag"])
app.include_router(general.router, prefix="/api", tags=["general"])

@app.get("/")
async def root():
    return {"message": "EM TaskFlow API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
