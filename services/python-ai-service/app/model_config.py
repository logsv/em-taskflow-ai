"""Single source of truth for local model names in the Python AI service.

Keep the defaults in sync with backend/src/llm/models.js. Override with env vars.
"""
import os

DEFAULT_LLM_MODEL = os.getenv("LLM_DEFAULT_MODEL", "qwen3:8b-q8_0")
DEFAULT_EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "nomic-embed-text")
