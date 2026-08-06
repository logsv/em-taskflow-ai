"""
Non-blocking Langfuse Telemetry Module for Python AI Microservice
Enforces Rule 2 (Zero-Downtime Telemetry): Tracing failures never crash API requests or add blocking latency.
"""

import os
import logging
import httpx
from functools import wraps

logger = logging.getLogger(__name__)

LANGFUSE_ENABLED = os.getenv("LANGFUSE_ENABLED", "true").lower() in ("true", "1")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "http://langfuse:3000")

langfuse_client = None

if LANGFUSE_ENABLED and LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY:
    try:
        # Pre-flight health check to prevent background thread connection spam
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


def trace_observation(name: str):
    """
    Non-blocking decorator for tracing function execution, parameters, and duration.
    Fails safely without raising exceptions if telemetry fails.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            span = None
            if langfuse_client:
                try:
                    span = langfuse_client.span(name=name, input={"args": str(args[:1]), "kwargs": str(kwargs)})
                except Exception as e:
                    logger.debug(f"Langfuse span start warning: {str(e)}")

            try:
                result = func(*args, **kwargs)
                if span:
                    try:
                        span.end(output={"success": True})
                    except Exception:
                        pass
                return result
            except Exception as err:
                if span:
                    try:
                        span.end(output={"success": False, "error": str(err)})
                    except Exception:
                        pass
                raise err
        return wrapper
    return decorator
