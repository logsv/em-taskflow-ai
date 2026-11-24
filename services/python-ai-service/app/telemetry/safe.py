"""Visible handling of non-fatal exceptions (Python counterpart of backend/src/core/safe.js).

Use instead of `except ...: pass` so a handled failure is still logged with its site.
"""
import logging

_logger = logging.getLogger("app.handled")


def log_handled(context: str, exc: BaseException, level: int = logging.WARNING) -> None:
    """Log a handled exception with the site that handled it."""
    _logger.log(level, "Handled error in %s: %s", context, exc)
