"""
DeepEval Local Driver & Trajectory Evaluation
Evaluates domain routing precision, G-Eval CoT, and single-tool adherence using local Ollama.
"""

import os
import json
import logging
from typing import Optional, Any, Dict
from deepeval.models.base_model import DeepEvalBaseLLM
from evals.model_config import DEFAULT_LLM_MODEL

logger = logging.getLogger("deepeval_judge")

try:
    from langchain_ollama import ChatOllama
except ImportError:
    try:
        from langchain_community.chat_models import ChatOllama
    except ImportError:
        ChatOllama = None



class JudgeUnavailableError(RuntimeError):
    """The LLM judge could not produce a judgement. Evaluations must fail or skip, never pass."""

class Hermes3Judge(DeepEvalBaseLLM):
    """Custom DeepEval LLM driver wrapping local Ollama chat model."""

    def __init__(self, model: str = DEFAULT_LLM_MODEL, base_url: Optional[str] = None):
        self.model_name = model
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        if ChatOllama:
            try:
                self._client = ChatOllama(
                    model=self.model_name,
                    base_url=self.base_url,
                    temperature=0.0,
                )
            except Exception as e:
                logger.warning(f"Could not initialize ChatOllama client: {e}")
                self._client = None
        else:
            self._client = None

    def load_model(self) -> Any:
        return self._client

    def generate(self, prompt: str) -> str:
        """Generates a judgement from local Ollama. Raises instead of inventing a score."""
        if not self._client:
            raise JudgeUnavailableError(f"Ollama judge client for {self.model_name} is not available")
        try:
            content = str(self._client.invoke(prompt).content).strip()
        except Exception as e:
            raise JudgeUnavailableError(f"Ollama judge call failed: {e}") from e
        if not content:
            raise JudgeUnavailableError("Ollama judge returned an empty response")
        return content

    async def a_generate(self, prompt: str) -> str:
        if not self._client:
            raise JudgeUnavailableError(f"Ollama judge client for {self.model_name} is not available")
        try:
            content = str((await self._client.ainvoke(prompt)).content).strip()
        except Exception as e:
            raise JudgeUnavailableError(f"Ollama judge call failed: {e}") from e
        if not content:
            raise JudgeUnavailableError("Ollama judge returned an empty response")
        return content

    def get_model_name(self) -> str:
        return f"Ollama {self.model_name}"
