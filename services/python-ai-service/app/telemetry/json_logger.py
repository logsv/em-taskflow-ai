import logging
import json
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Custom JSON Log Formatter for Python AI Microservice."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "service": "em-taskflow-python-ai",
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        
        # Merge structured extra details
        details = {}
        if hasattr(record, "details") and isinstance(record.details, dict):
            details.update(record.details)
        if hasattr(record, "action"):
            details["action"] = record.action
        if hasattr(record, "module"):
            details["module"] = record.module
        if hasattr(record, "duration_ms"):
            details["duration_ms"] = record.duration_ms
        if details:
            log_obj["details"] = details

        return json.dumps(log_obj)


def setup_json_logging(level: int = logging.INFO):
    """Configures root Python logger to output single-line JSON logs and optional Axiom Cloud transport."""
    import os
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Remove existing default handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
        
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root_logger.addHandler(handler)

    axiom_token = os.environ.get("AXIOM_TOKEN")
    axiom_dataset = os.environ.get("AXIOM_DATASET", "emtaskflowai")
    if axiom_token:
        try:
            from axiom_py import Client
            from axiom_py.logging import AxiomHandler

            class SafeAxiomHandler(AxiomHandler):
                def emit(self, record):
                    try:
                        super().emit(record)
                    except Exception:
                        pass

                def flush(self):
                    try:
                        super().flush()
                    except Exception:
                        pass

                def close(self):
                    try:
                        super().close()
                    except Exception:
                        pass

            axiom_client = Client(token=axiom_token)
            axiom_handler = SafeAxiomHandler(axiom_client, axiom_dataset)
            axiom_handler.setLevel(level)
            root_logger.addHandler(axiom_handler)
        except Exception as e:
            # Output warning using standard logger
            root_logger.warning(f"Failed to setup Axiom logging handler: {e}")

    return root_logger



