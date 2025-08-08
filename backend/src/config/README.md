# Configuration Management

This directory contains the Convict-based configuration management system for EM TaskFlow.

## Overview

The configuration system uses [Convict](https://www.npmjs.com/package/convict) to provide:
- **Type-safe configuration** with validation
- **Environment variable integration** with fallback values
- **Local developer customization** via local.json
- **Centralized configuration schema** for all services
- **Single configuration file** for local development

## Configuration Files

### Core Files
- `index.ts` - Main configuration loader and helper functions
- `schema.ts` - Complete configuration schema with validation
- `local.json` - Single local configuration file (NOT committed to git)

### Optional Files
- `local.example.json` - Example local configuration file

## Configuration Loading

Configuration loads in this order (later sources override earlier ones):

1. **Default values** from schema
2. **Local configuration** (`local.json`)
3. **Environment variables** - highest priority

## Configuration Schema

### Server Configuration
```json
{
  "server": {
    "port": 4000,
    "host": "127.0.0.1"
  }
}
```

### Database Configuration
```json
{
  "database": {
    "path": "./data/taskflow.db"
  }
}
```

### LLM Provider Configuration
```json
{
  "llm": {
    "defaultProvider": "ollama",
    "defaultModel": "mistral:latest",
    "loadBalancingStrategy": "round_robin",
    "providers": {
      "openai": {
        "enabled": false,
        "apiKey": "YOUR_OPENAI_API_KEY",
        "priority": 1
      },
      "anthropic": {
        "enabled": false,
        "apiKey": "YOUR_ANTHROPIC_API_KEY",
        "priority": 2
      },
      "google": {
        "enabled": false,
        "apiKey": "YOUR_GOOGLE_API_KEY",
        "priority": 3
      },
      "ollama": {
        "enabled": true,
        "baseUrl": "http://localhost:11434",
        "priority": 4
      }
    }
  }
}
```

### Vector Database Configuration
```json
{
  "vectorDb": {
    "chroma": {
      "host": "localhost",
      "port": 8000
    }
  }
}
```

### MCP Integration Configuration
```json
{
  "mcp": {
    "notion": {
      "enabled": false,
      "apiKey": "YOUR_NOTION_API_KEY"
    },
    "jira": {
      "enabled": false,
      "url": "https://your-domain.atlassian.net",
      "username": "your-email@domain.com",
      "apiToken": "YOUR_JIRA_API_TOKEN",
      "projectKey": "YOUR_PROJECT_KEY"
    },
    "google": {
      "enabled": false,
      "oauthCredentials": "YOUR_GOOGLE_OAUTH_CREDENTIALS_JSON",
      "calendarId": "primary"
    }
  }
}
```

### RAG Configuration
```json
{
  "rag": {
    "enabled": true,
    "embeddingModel": "nomic-embed-text",
    "defaultCollection": "pdf_chunks",
    "maxChunkSize": 800
  }
}
```

## Usage

### In TypeScript/JavaScript
```typescript
import { config, getServerConfig, getLlmConfig, getMcpConfig } from './config/index.js';

// Get complete configuration
const allConfig = config;

// Get specific sections
const serverConfig = getServerConfig();
const llmConfig = getLlmConfig();
const mcpConfig = getMcpConfig();

// Access specific values
const port = serverConfig.port;
const providers = getLlmProviders(); // Returns providers in priority order
```

### Environment Variables
All configuration values can be overridden with environment variables:

```bash
# Server configuration
export PORT=3000
export HOST="0.0.0.0"

# LLM providers
export LLM_OPENAI_ENABLED=true
export OPENAI_API_KEY="your-api-key"
export LLM_OLLAMA_BASE_URL="http://ollama:11434"

# MCP integrations
export NOTION_API_KEY="your-notion-key"
export MCP_NOTION_ENABLED=true

# RAG settings
export RAG_MAX_CHUNK_SIZE=1200
```

### Local Development Setup

1. Copy the example local configuration:
   ```bash
   cp src/config/local.example.json src/config/local.json
   ```

2. Edit `local.json` with your API keys and preferences:
   ```json
   {
     "llm": {
       "defaultProvider": "openai",
       "providers": {
         "openai": {
           "enabled": true,
           "apiKey": "your-openai-api-key"
         }
       }
     },
     "mcp": {
       "notion": {
         "enabled": true,
         "apiKey": "your-notion-api-key"
       }
     }
   }
   ```

3. The `local.json` file is ignored by git and won't be committed.

## Validation

The configuration system validates all values on startup:
- **Type checking** - ensures correct data types
- **Format validation** - validates ports, URLs, etc.
- **Required field checking** - ensures critical values are present
- **Circuit breaker and retry validation** - ensures valid network resilience settings

## Security

- **Sensitive values** are marked in the schema and handled securely
- **Local configuration files** are excluded from version control
- **Environment variables** take precedence for sensitive data
- **API keys and tokens** should never be committed to the repository

## Helper Functions

The configuration system provides several helper functions:

```typescript
import { 
  config,
  getServerConfig,
  getDatabaseConfig,
  getVectorDbConfig,
  getRagConfig,
  getLlmConfig,
  getMcpConfig,
  getLlmProviders,
  toLlmRouterConfig
} from './config/index.js';

// Get providers sorted by priority
const providers = getLlmProviders();

// Convert to LLM Router compatible format
const routerConfig = toLlmRouterConfig();
```

## Migration Benefits

This unified system provides:

1. **Single source of truth** - one local.json file instead of multiple YAML files
2. **Better type safety** - compile-time validation of configuration access
3. **Simplified development** - easier to manage API keys and settings
4. **Environment flexibility** - easy override with environment variables
5. **Production ready** - robust validation and error handling