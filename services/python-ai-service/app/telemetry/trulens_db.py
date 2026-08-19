"""
TruLens Database Connection & Session Factory
Provides a unified TruSession connection to the dedicated PostgreSQL evaluation database (taskflow_eval).
Guarantees zero downtime by falling back silently to local SQLite if PostgreSQL is unreachable during offline/mock testing.
"""

import os
import logging
from typing import Optional
from trulens.core import TruSession

logger = logging.getLogger(__name__)


def get_trulens_database_url() -> Optional[str]:
    """Resolves the PostgreSQL connection URL for the dedicated taskflow_eval database."""
    explicit_url = os.getenv("TRULENS_DATABASE_URL")
    if explicit_url:
        return explicit_url

    user = os.getenv("POSTGRES_USER", "taskflow")
    password = os.getenv("POSTGRES_PASSWORD", "taskflow")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db_name = os.getenv("TRULENS_DB_NAME", "taskflow_eval")

    # Prefer psycopg3 dialect, with fallback capability
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{db_name}"


def get_trulens_session() -> TruSession:
    """
    Returns a configured TruSession instance.
    Attempts PostgreSQL taskflow_eval connection first; falls back to SQLite default.sqlite on error.
    """
    db_url = get_trulens_database_url()
    try:
        if db_url:
            session = TruSession(database_url=db_url)
            logger.info(f"✅ TruSession connected to PostgreSQL database (taskflow_eval)")
            return session
    except Exception as pg_err:
        logger.debug(f"⚠️ TruLens PostgreSQL connection fallback to local SQLite: {pg_err}")

    # Fallback to local SQLite store
    return TruSession()
