import logging
import json
from datetime import datetime


class JSONFormatter(logging.Formatter):
    """Custom JSON Log Formatter for Python AI Microservice."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "service": "em-taskflow-python-ai",
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "details") and isinstance(record.details, dict):
            log_obj["details"] = record.details
        return json.dumps(log_obj)


def setup_json_logging(level: int = logging.INFO):
    """Configures root Python logger to output single-line JSON logs."""
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Remove existing default handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
        
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root_logger.addHandler(handler)
    return root_logger
