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

from app.telemetry.json_logger import setup_json_logging

setup_json_logging(logging.INFO)
logger = logging.getLogger("app.main")

sentry_dsn = os.environ.get("SENTRY_DSN")
if sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.asyncio import AsyncioIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        import logging as _logging

        sentry_sdk.init(
            dsn=sentry_dsn,
            environment=os.environ.get("ENVIRONMENT", "development"),
            release=os.environ.get("APP_VERSION", "em-taskflow-python-ai@1.0.0"),
            # Capture 10% of transactions for performance monitoring
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            # Capture 100% of errors/exceptions
            sample_rate=1.0,
            integrations=[
                # FastAPI + Starlette must both be listed together
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
                # Capture asyncio task errors automatically
                AsyncioIntegration(),
                # Forward ERROR+ Python log records to Sentry as breadcrumbs/events
                LoggingIntegration(
                    level=_logging.INFO,        # Breadcrumb level
                    event_level=_logging.ERROR, # Create Sentry event on ERROR+
                ),
            ],
            # Strip PII from payloads
            send_default_pii=False,
        )
        logger.info("Sentry SDK initialized for Python AI microservice (FastAPI + asyncio + logging)")
    except Exception as e:
        logger.warning(f"Sentry SDK initialization failed: {e}")


newrelic_license_key = os.environ.get("NEW_RELIC_LICENSE_KEY")
if newrelic_license_key:
    try:
        import newrelic.agent
        app_name = os.environ.get("NEW_RELIC_APP_NAME", "em-taskflow-python-ai")
        newrelic.agent.initialize()
        newrelic.agent.register_application(name=app_name, timeout=10.0)
        logger.info("New Relic APM agent initialized for Python AI microservice")
    except Exception as e:
        logger.warning(f"New Relic APM initialization warning: {e}")

if os.environ.get("OTEL_ENABLED") != "false":
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.grpc import GrpcInstrumentorClient, GrpcInstrumentorServer

        endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
        provider = TracerProvider()
        processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True))
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        GrpcInstrumentorClient().instrument()
        GrpcInstrumentorServer().instrument()
        logger.info("OpenTelemetry gRPC client & server instrumented for Python AI microservice")
    except Exception as e:
        logger.warning(f"OpenTelemetry Python initialization warning: {e}")

import uvicorn
from app.api.rest_router import router as api_router
from app.grpc_server.ai_service_grpc import AIServiceServicer

app = FastAPI(
    title="EM TaskFlow AI Microservice",
    description="Dual FastAPI REST and gRPC AI document processing & anti-hallucination RAG service.",
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


def start_grpc_server(port: int = 50051):
    """Start gRPC server in background thread."""
    try:
        import grpc
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        servicer = AIServiceServicer()
        server.add_insecure_port(f"[::]:{port}")
        server.start()
        logger.info(f"Python gRPC Server running on port {port}")
        return server
    except Exception as e:
        logger.warning(f"gRPC server startup warning: {e}")
        return None


if __name__ == "__main__":
    grpc_port = int(os.environ.get("GRPC_PORT", 50051))
    rest_port = int(os.environ.get("REST_PORT", 8000))
    
    server = start_grpc_server(grpc_port)
    logger.info(f"FastAPI REST Server running on port {rest_port} (OpenAPI: http://localhost:{rest_port}/docs)")
    uvicorn.run("app.main:app", host="0.0.0.0", port=rest_port, reload=False)
