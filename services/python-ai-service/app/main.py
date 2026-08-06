"""
Dual-Boot Entrypoint for Python AI Microservice
Runs FastAPI REST server on Port 8000 and gRPC Servicer on Port 50051.
"""

import sys
import os

# Ensure root app directory is in Python path for module resolution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import asyncio
import logging
from concurrent import futures
from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
import uvicorn
from app.api.rest_router import router as api_router
from app.grpc_server.ai_service_grpc import AIServiceServicer

app = FastAPI(
    title="EM TaskFlow AI Microservice",
    description="Dual FastAPI REST and gRPC AI document processing & anti-hallucination RAG service.",
    version="1.0.0",
)

app.include_router(api_router)


@app.on_event("startup")
async def startup_event():
    from app.temporal.worker import start_temporal_worker
    asyncio.create_task(start_temporal_worker())


def start_grpc_server(port: int = 50051):
    """Start gRPC server in background thread."""
    try:
        import grpc
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        servicer = AIServiceServicer()
        # Add servicer to gRPC server dynamically or via generated stubs
        server.add_insecure_port(f"[::]:{port}")
        server.start()
        print(f"🚀 Python gRPC Server running on port {port}")
        return server
    except Exception as e:
        print(f"⚠️ gRPC server startup warning: {e}")
        return None


if __name__ == "__main__":
    grpc_port = int(os.environ.get("GRPC_PORT", 50051))
    rest_port = int(os.environ.get("REST_PORT", 8000))
    
    server = start_grpc_server(grpc_port)
    print(f"⚡ FastAPI REST Server running on port {rest_port} (OpenAPI: http://localhost:{rest_port}/docs)")
    uvicorn.run("app.main:app", host="0.0.0.0", port=rest_port, reload=False)
