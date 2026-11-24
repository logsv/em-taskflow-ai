"""Default local model for the evaluation engine. Keep in sync with backend/src/llm/models.js."""
import os

DEFAULT_LLM_MODEL = os.getenv("LLM_DEFAULT_MODEL", "qwen3:8b-q8_0")
