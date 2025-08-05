# Configuration Management

This directory contains the Convict-based configuration management system for EM TaskFlow.

## Overview

The configuration system uses [Convict](https://www.npmjs.com/package/convict) to provide:
- **Type-safe configuration** with validation
- **Environment-specific overrides** (development, production, test)
- **Local developer customization** via local.yml
- **Environment variable integration** with fallback to YAML files
- **Centralized configuration schema** for all services

## Configuration Files

### Core Files
- `config.ts` - Main configuration schema and loader
- `default.yml` - Default configuration values for all environments
- `development.yml` - Development-specific overrides
- `production.yml` - Production-specific overrides  
- `test.yml` - Test-specific overrides

### Optional Files
- `local.yml` - Local developer overrides (NOT committed to git)
- `local.example.yml` - Example local configuration file

## Configuration Loading Priority

Configurations are loaded in this order (later files override earlier ones):

1. **Default configuration** (`default.yml`)
2. **Environment-specific** (`development.yml`, `production.yml`, or `test.yml`)
3. **Local overrides** (`local.yml`) - highest priority
4. **Environment variables** - highest priority

## Configuration Schema

### Server Configuration
```yaml
server:
  port: 4000          # Server port (PORT env var)
  host: "127.0.0.1"   # Bind address (HOST env var)
```

### Database Configuration
```yaml
database:
  path: "./data/taskflow.db"  # SQLite database path (DATABASE_PATH env var)
```

### LLM Provider Configuration
```yaml
llm:
  provider: "ollama"  # Primary provider: openai|anthropic|google|huggingface|ollama
  openai:
    apiKey: ""        # OpenAI API key (OPENAI_API_KEY env var)
  anthropic:
    apiKey: ""        # Anthropic API key (ANTHROPIC_API_KEY env var)
  google:
    apiKey: ""        # Google AI API key (GOOGLE_API_KEY env var)
  huggingface:
    apiKey: ""        # Hugging Face API key (HF_API_KEY env var)
  ollama:
    baseUrl: "http://localhost:11434"  # Ollama URL (OLLAMA_BASE_URL env var)
```

### Vector Database Configuration
```yaml
vectorDb:
  chroma:
    host: "localhost"  # ChromaDB host (CHROMA_HOST env var)
    port: 8000         # ChromaDB port (CHROMA_PORT env var)
```

### MCP Integration Configuration
```yaml
mcp:
  notion:
    apiKey: ""      # Notion API key (NOTION_API_KEY env var)
    enabled: false  # Enable Notion integration (NOTION_ENABLED env var)
  jira:
    url: ""         # Jira URL (JIRA_URL env var)
    username: ""    # Jira username (JIRA_USERNAME env var)
    apiToken: ""    # Jira API token (JIRA_API_TOKEN env var)
    projectKey: ""  # Jira project key (JIRA_PROJECT_KEY env var)
    enabled: false  # Enable Jira integration (JIRA_ENABLED env var)
  google:
    oauthCredentials: ""  # Google OAuth JSON (GOOGLE_OAUTH_CREDENTIALS env var)
    calendarId: "primary" # Calendar ID (GOOGLE_CALENDAR_ID env var)
    enabled: false        # Enable Google integration (GOOGLE_ENABLED env var)
```

### RAG Configuration
```yaml
rag:
  enabled: true                    # Enable RAG functionality (RAG_ENABLED env var)
  embeddingModel: "nomic-embed-text"  # Embedding model (RAG_EMBEDDING_MODEL env var)
  defaultCollection: "pdf_chunks"     # ChromaDB collection (RAG_DEFAULT_COLLECTION env var)
  maxChunkSize: 1000                  # Max chunk size (RAG_MAX_CHUNK_SIZE env var)
```

## Usage

### In TypeScript/JavaScript
```typescript
import config from './config/config.js';

// Get configuration values
const port = config.get('server.port');
const dbPath = config.get('database.path');
const llmProvider = config.get('llm.provider');
const ragEnabled = config.get('rag.enabled');
```

### Environment Variables
All configuration values can be overridden with environment variables:

```bash
# Server configuration
export PORT=3000
export HOST="0.0.0.0"

# LLM provider
export LLM_PROVIDER="openai"
export OPENAI_API_KEY="your-api-key"

# MCP integrations
export NOTION_API_KEY="your-notion-key"
export NOTION_ENABLED=true
```

### Local Development Setup

1. Copy the example local configuration:
   ```bash
   cp src/config/local.example.yml src/config/local.yml
   ```

2. Edit `local.yml` with your API keys and preferences:
   ```yaml
   llm:
     provider: "openai"
     openai:
       apiKey: "your-openai-api-key"
   
   mcp:
     notion:
       apiKey: "your-notion-api-key"
       enabled: true
   ```

3. The `local.yml` file is ignored by git and won't be committed.

## Validation

The configuration system validates all values on startup:
- **Type checking** - ensures correct data types
- **Format validation** - validates ports, URLs, etc.
- **Required field checking** - ensures critical values are present
- **Environment-specific rules** - different validation per environment

## Security

- **Sensitive values** are marked in the schema and handled securely
- **Local configuration files** are excluded from version control
- **Environment variables** take precedence for sensitive data
- **API keys and tokens** should never be committed to the repository

## Migration from process.env

This system replaces direct `process.env` usage throughout the codebase:

**Before:**
```typescript
const port = process.env.PORT || 4000;
const apiKey = process.env.OPENAI_API_KEY || '';
```

**After:**
```typescript
import config from './config/config.js';
const port = config.get('server.port');
const apiKey = config.get('llm.openai.apiKey');
```

This provides better type safety, validation, and centralized configuration management.