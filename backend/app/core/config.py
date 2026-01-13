from pydantic_settings import BaseSettings
from pydantic import Field, HttpUrl, IPvAnyAddress
from typing import Optional, List, Literal
import os

class Settings(BaseSettings):
    NODE_ENV: Literal['development', 'test', 'production'] = 'development'
    PORT: int = 4000
    HOST: str = "127.0.0.1"

    # Database
    DATABASE_PATH: str = "./data/taskflow.db"

    # ChromaDB
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000

    # RAG
    RAG_ENABLED: bool = True
    RAG_EMBEDDING_MODEL: str = "nomic-embed-text"
    RAG_DEFAULT_COLLECTION: str = "pdf_chunks"
    RAG_MAX_CHUNK_SIZE: int = 1000

    # LLM
    LLM_DEFAULT_PROVIDER: str = "ollama"
    LLM_DEFAULT_MODEL: str = "gpt-oss:latest"
    LLM_LOAD_BALANCING: Literal['round_robin', 'cost_priority_round_robin'] = 'round_robin'

    # OpenAI
    LLM_OPENAI_ENABLED: bool = False
    OPENAI_API_KEY: Optional[str] = None
    LLM_OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    LLM_OPENAI_PRIORITY: int = 1

    # Anthropic
    LLM_ANTHROPIC_ENABLED: bool = False
    ANTHROPIC_API_KEY: Optional[str] = None
    LLM_ANTHROPIC_BASE_URL: str = "https://api.anthropic.com/v1"
    LLM_ANTHROPIC_PRIORITY: int = 2

    # Google
    LLM_GOOGLE_ENABLED: bool = False
    GOOGLE_API_KEY: Optional[str] = None
    LLM_GOOGLE_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    LLM_GOOGLE_PRIORITY: int = 3

    # Ollama
    LLM_OLLAMA_ENABLED: bool = True
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_OLLAMA_PRIORITY: int = 4

    # MCP
    MCP_NOTION_ENABLED: bool = False
    NOTION_API_KEY: Optional[str] = None

    MCP_JIRA_ENABLED: bool = False
    JIRA_URL: str = "https://example.jira.com"
    JIRA_USERNAME: str = ""
    JIRA_API_TOKEN: str = ""
    JIRA_PROJECT_KEY: str = ""

    MCP_GOOGLE_ENABLED: bool = False
    GOOGLE_OAUTH_CREDENTIALS: Optional[str] = None
    GOOGLE_CALENDAR_ID: str = "primary"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
