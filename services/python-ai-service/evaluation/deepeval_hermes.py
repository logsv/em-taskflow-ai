"""
DeepEval Local LLM Driver for Ollama (local chat model)
Enables DeepEval's GEval, AnswerRelevancyMetric, and FaithfulnessMetric
to execute 100% locally with zero cloud API keys.
"""

import os
import json
import logging
from typing import Optional, Any
from deepeval.models.base_model import DeepEvalBaseLLM
from app.model_config import DEFAULT_LLM_MODEL

logger = logging.getLogger(__name__)

try:
    from langchain_ollama import ChatOllama
except ImportError:
    try:
        from langchain_community.chat_models.ollama import ChatOllama
    except ImportError:
        try:
            from langchain_community.chat_models import ChatOllama
        except ImportError:
            ChatOllama = None


class JudgeUnavailableError(RuntimeError):
    """The LLM judge could not produce a judgement. Evaluations must fail or skip, never pass."""


def is_ollama_reachable(base_url: Optional[str] = None, timeout: float = 2.0) -> bool:
    import httpx
    url = (base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")
    try:
        return httpx.get(f"{url}/api/tags", timeout=timeout).status_code == 200
    except Exception:
        return False


class Hermes3Judge(DeepEvalBaseLLM):
    """
    Custom DeepEval LLM driver wrapping local Ollama chat model.
    """

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

    def _parse(self, content: str, schema: Optional[Any] = None) -> Any:
        if schema is None:
            return content
        try:
            parsed_json = json.loads(content)
        except json.JSONDecodeError as e:
            raise JudgeUnavailableError(f"Judge returned non-JSON output: {content[:120]}") from e
        if hasattr(schema, "model_validate"):
            return schema.model_validate(parsed_json)
        if hasattr(schema, "parse_obj"):
            return schema.parse_obj(parsed_json)
        return parsed_json

    def generate(self, prompt: str, schema: Optional[Any] = None, *args, **kwargs) -> Any:
        """Synchronously generates a judgement from local Ollama. Never invents one."""
        if not self._client:
            raise JudgeUnavailableError(f"Ollama judge client for {self.model_name} is not available")
        try:
            response = self._client.invoke(prompt)
        except Exception as e:
            raise JudgeUnavailableError(f"Ollama judge call failed: {e}") from e
        content = str(response.content).strip()
        if not content:
            raise JudgeUnavailableError("Ollama judge returned an empty response")
        return self._parse(content, schema)

    async def a_generate(self, prompt: str, schema: Optional[Any] = None, *args, **kwargs) -> Any:
        """Asynchronously generates a judgement from local Ollama. Never invents one."""
        if not self._client:
            raise JudgeUnavailableError(f"Ollama judge client for {self.model_name} is not available")
        try:
            response = await self._client.ainvoke(prompt)
        except Exception as e:
            raise JudgeUnavailableError(f"Ollama judge call failed: {e}") from e
        content = str(response.content).strip()
        if not content:
            raise JudgeUnavailableError("Ollama judge returned an empty response")
        return self._parse(content, schema)

    def get_model_name(self) -> str:
        return f"Ollama {self.model_name}"

