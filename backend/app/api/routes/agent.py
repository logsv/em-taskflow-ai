from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.services.agent import agent_service
from fastapi.responses import StreamingResponse

router = APIRouter()

class QueryRequest(BaseModel):
    query: str
    maxIterations: Optional[int] = 10
    includeRAG: Optional[bool] = True

@router.post("/query")
async def query_agent(request: QueryRequest):
    try:
        result = await agent_service.process_query(request.query, request.maxIterations)
        # Extract the final response from the agent result
        # LangGraph result structure depends on the agent
        # Usually result["messages"][-1].content
        return {
            "status": "success",
            "data": result, # You might want to format this
            "timestamp": "now" # Replace with actual timestamp
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream")
async def stream_agent(request: QueryRequest):
    async def generate():
        yield f"data: {{\"type\": \"connected\", \"message\": \"Starting Agent...\"}}\n\n"
        async for chunk in agent_service.stream_query(request.query):
             yield f"data: {{\"type\": \"token\", \"content\": \"{chunk}\"}}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
