"""
Non-blocking Dual Telemetry Module (Langfuse & Arize Phoenix / OpenInference) for Python AI Service
Enforces Rule 2 (Zero-Downtime Telemetry): Tracing failures never crash API requests or add blocking latency.
"""

import os
import json
import logging
import httpx
from functools import wraps

logger = logging.getLogger(__name__)

LANGFUSE_ENABLED = os.getenv("LANGFUSE_ENABLED", "true").lower() in ("true", "1")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "http://langfuse:3000")

PHOENIX_ENABLED = os.getenv("PHOENIX_ENABLED", "true").lower() in ("true", "1")
PHOENIX_COLLECTOR_ENDPOINT = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://phoenix:6006/v1/traces")

langfuse_client = None
otel_tracer = None

# 1. Initialize Langfuse Client if configured
if LANGFUSE_ENABLED and LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY:
    try:
        health_res = httpx.get(f"{LANGFUSE_HOST}/api/public/health", timeout=1.0)
        if health_res.status_code == 200:
            from langfuse import Langfuse
            langfuse_client = Langfuse(
                public_key=LANGFUSE_PUBLIC_KEY,
                secret_key=LANGFUSE_SECRET_KEY,
                host=LANGFUSE_HOST,
            )
            logger.info(f"✅ Langfuse tracing initialized (Host: {LANGFUSE_HOST})")
        else:
            logger.info(f"⚠️ Langfuse host status {health_res.status_code} at {LANGFUSE_HOST}, telemetry disabled.")
    except Exception as e:
        logger.info(f"⚠️ Langfuse host unreachable at {LANGFUSE_HOST} ({str(e)}), telemetry disabled.")

# 2. Initialize OpenTelemetry Tracer for OpenInference / Arize Phoenix if available
if PHOENIX_ENABLED:
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.resources import Resource

        resource = Resource.create({"service.name": "python-ai-service", "project.name": "emtaskflow"})
        provider = TracerProvider(resource=resource)
        trace.set_tracer_provider(provider)
        otel_tracer = trace.get_tracer("python-ai-service.retriever", "1.0.0")
        logger.info(f"✅ OpenInference tracer initialized for Phoenix (Endpoint: {PHOENIX_COLLECTOR_ENDPOINT})")
    except Exception as e:
        logger.debug(f"OpenTelemetry initialization warning: {str(e)}")


def trace_observation(name: str):
    """
    Non-blocking dual decorator for tracing function execution, parameters, and duration
    across both Langfuse and Arize Phoenix (OpenInference).
    Fails safely without raising exceptions if telemetry fails.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            span = None
            otel_span = None

            # Start Langfuse span
            if langfuse_client:
                try:
                    span = langfuse_client.span(name=name, input={"args": str(args[:1]), "kwargs": str(kwargs)})
                except Exception as e:
                    logger.debug(f"Langfuse span start warning: {str(e)}")

            # Start OpenInference span for Phoenix
            if otel_tracer:
                try:
                    span_kind = "RETRIEVER" if any(k in name.lower() for k in ["search", "rerank", "extract", "chunk"]) else "CHAIN"
                    input_val = str(args[1]) if len(args) > 1 else str(kwargs.get("query_text") or kwargs.get("query") or args[:1])
                    otel_span = otel_tracer.start_span(
                        name,
                        attributes={
                            "openinference.span.kind": span_kind,
                            "input.value": input_val,
                        },
                    )
                except Exception:
                    pass

            try:
                result = func(*args, **kwargs)

                # End Langfuse span
                if span:
                    try:
                        span.end(output={"success": True})
                    except Exception:
                        pass

                # End OpenTelemetry span
                if otel_span:
                    try:
                        out_val = f"Returned {len(result)} items" if isinstance(result, list) else "Success"
                        otel_span.set_attribute("output.value", out_val)
                        otel_span.end()
                    except Exception:
                        pass

                return result
            except Exception as err:
                if span:
                    try:
                        span.end(output={"success": False, "error": str(err)})
                    except Exception:
                        pass

                if otel_span:
                    try:
                        otel_span.set_attribute("error", True)
                        otel_span.set_attribute("output.value", str(err))
                        otel_span.end()
                    except Exception:
                        pass

                raise err
        return wrapper
    return decorator

