"""
Entrypoint for the Python AI microservice: FastAPI REST server on port 8000.
"""

import sys
import os

os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

# Ensure root app directory is in Python path for module resolution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import asyncio
import logging
from fastapi import FastAPI

from app.telemetry.json_logger import setup_json_logging

setup_json_logging(logging.INFO)
logger = logging.getLogger("app.main")

if os.environ.get("OTEL_ENABLED") != "false":
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
        provider = TracerProvider()
        processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True))
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        logger.info("OpenTelemetry tracer provider configured for the Python AI service")
    except Exception as e:
        logger.warning(f"OpenTelemetry Python initialization warning: {e}")

import uvicorn
from app.api.rest_router import router as api_router

app = FastAPI(
    title="EM TaskFlow AI Microservice",
    description="REST API for document extraction, chunking, hybrid retrieval, reranking and evaluation.",
    version="1.0.0",
)

if os.environ.get("OTEL_ENABLED") != "false":
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor.instrument_app(app)
        logger.info("OpenTelemetry FastAPI auto-instrumentation attached")
    except Exception as e:
        logger.warning(f"OpenTelemetry FastAPI attachment warning: {e}")

app.include_router(api_router)


@app.on_event("startup")
async def startup_event():
    from app.temporal.worker import start_temporal_worker
    asyncio.create_task(start_temporal_worker())


if __name__ == "__main__":
    rest_port = int(os.environ.get("REST_PORT", 8000))
    logger.info(f"FastAPI REST Server running on port {rest_port} (OpenAPI: http://localhost:{rest_port}/docs)")
    uvicorn.run("app.main:app", host="0.0.0.0", port=rest_port, reload=False)
