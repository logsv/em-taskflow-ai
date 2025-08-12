import convict from 'convict';

// Define custom format for provider arrays
convict.addFormat({
  name: 'providers-array',
  validate: function (providers) {
    if (!Array.isArray(providers)) {
      throw new Error('must be an array');
    }
    providers.forEach((provider, index) => {
      if (!provider.name || !provider.type) {
        throw new Error(`Provider at index ${index} must have name and type`);
      }
    });
  },
  coerce: function (val) {
    return val;
  }
});

// Convict configuration schema
export const configSchema = convict({
  // Environment
  env: {
    doc: 'The application environment',
    format: ['development', 'test', 'production'],
    default: 'development',
    env: 'NODE_ENV'
  },

  // Server Configuration
  server: {
    port: {
      doc: 'The port to bind the server to',
      format: 'port',
      default: 4000,
      env: 'PORT'
    },
    host: {
      doc: 'The IP address to bind the server to',
      format: String,
      default: '127.0.0.1',
      env: 'HOST'
    }
  },

  // Database Configuration
  database: {
    path: {
      doc: 'Path to the SQLite database file',
      format: String,
      default: './data/taskflow.db',
      env: 'DATABASE_PATH'
    }
  },

  // Vector Database Configuration
  vectorDb: {
    chroma: {
      host: {
        doc: 'ChromaDB host',
        format: String,
        default: 'localhost',
        env: 'CHROMA_HOST'
      },
      port: {
        doc: 'ChromaDB port',
        format: 'port',
        default: 8000,
        env: 'CHROMA_PORT'
      }
    }
  },

  // RAG Configuration
  rag: {
    enabled: {
      doc: 'Enable RAG functionality',
      format: Boolean,
      default: true,
      env: 'RAG_ENABLED'
    },
    embeddingModel: {
      doc: 'Embedding model for RAG',
      format: String,
      default: 'nomic-embed-text',
      env: 'RAG_EMBEDDING_MODEL'
    },
    defaultCollection: {
      doc: 'Default collection name for vector storage',
      format: String,
      default: 'pdf_chunks',
      env: 'RAG_DEFAULT_COLLECTION'
    },
    maxChunkSize: {
      doc: 'Maximum chunk size for document processing',
      format: 'nat',
      default: 1000,
      env: 'RAG_MAX_CHUNK_SIZE'
    }
  },

  // LLM Configuration
  llm: {
    defaultProvider: {
      doc: 'Default LLM provider',
      format: String,
      default: 'ollama',
      env: 'LLM_DEFAULT_PROVIDER'
    },
    defaultModel: {
      doc: 'Default model to use',
      format: String,
      default: 'gpt-oss:latest',
      env: 'LLM_DEFAULT_MODEL'
    },
    loadBalancingStrategy: {
      doc: 'Load balancing strategy for multiple providers',
      format: ['round_robin', 'cost_priority_round_robin', 'priority'],
      default: 'round_robin',
      env: 'LLM_LOAD_BALANCING'
    },
    
    // Provider Configurations
    providers: {
      openai: {
        name: {
          doc: 'Provider name',
          format: String,
          default: 'openai'
        },
        type: {
          doc: 'Provider type',
          format: String,
          default: 'openai'
        },
        enabled: {
          doc: 'Enable OpenAI provider',
          format: Boolean,
          default: false,
          env: 'LLM_OPENAI_ENABLED'
        },
        apiKey: {
          doc: 'OpenAI API key',
          format: String,
          default: '',
          env: 'OPENAI_API_KEY',
          sensitive: true
        },
        baseUrl: {
          doc: 'OpenAI base URL',
          format: String,
          default: 'https://api.openai.com/v1',
          env: 'LLM_OPENAI_BASE_URL'
        },
        priority: {
          doc: 'Provider priority (higher = more preferred)',
          format: 'nat',
          default: 1,
          env: 'LLM_OPENAI_PRIORITY'
        },
        circuitBreaker: {
          failureThreshold: {
            doc: 'Circuit breaker failure threshold',
            format: 'nat',
            default: 5,
            env: 'LLM_OPENAI_CB_FAILURE_THRESHOLD'
          },
          successThreshold: {
            doc: 'Circuit breaker success threshold',
            format: 'nat',
            default: 3,
            env: 'LLM_OPENAI_CB_SUCCESS_THRESHOLD'
          },
          timeout: {
            doc: 'Circuit breaker timeout (ms)',
            format: 'nat',
            default: 60000,
            env: 'LLM_OPENAI_CB_TIMEOUT'
          }
        },
        retry: {
          maxAttempts: {
            doc: 'Maximum retry attempts',
            format: 'nat',
            default: 3,
            env: 'LLM_OPENAI_RETRY_MAX_ATTEMPTS'
          },
          initialDelay: {
            doc: 'Initial retry delay (ms)',
            format: 'nat',
            default: 1000,
            env: 'LLM_OPENAI_RETRY_INITIAL_DELAY'
          },
          maxDelay: {
            doc: 'Maximum retry delay (ms)',
            format: 'nat',
            default: 30000,
            env: 'LLM_OPENAI_RETRY_MAX_DELAY'
          },
          factor: {
            doc: 'Exponential backoff factor',
            format: Number,
            default: 2,
            env: 'LLM_OPENAI_RETRY_FACTOR'
          }
        }
      },

      anthropic: {
        name: {
          doc: 'Provider name',
          format: String,
          default: 'anthropic'
        },
        type: {
          doc: 'Provider type',
          format: String,
          default: 'anthropic'
        },
        enabled: {
          doc: 'Enable Anthropic provider',
          format: Boolean,
          default: false,
          env: 'LLM_ANTHROPIC_ENABLED'
        },
        apiKey: {
          doc: 'Anthropic API key',
          format: String,
          default: '',
          env: 'ANTHROPIC_API_KEY',
          sensitive: true
        },
        baseUrl: {
          doc: 'Anthropic base URL',
          format: String,
          default: 'https://api.anthropic.com/v1',
          env: 'LLM_ANTHROPIC_BASE_URL'
        },
        priority: {
          doc: 'Provider priority (higher = more preferred)',
          format: 'nat',
          default: 2,
          env: 'LLM_ANTHROPIC_PRIORITY'
        },
        circuitBreaker: {
          failureThreshold: {
            doc: 'Circuit breaker failure threshold',
            format: 'nat',
            default: 5,
            env: 'LLM_ANTHROPIC_CB_FAILURE_THRESHOLD'
          },
          successThreshold: {
            doc: 'Circuit breaker success threshold',
            format: 'nat',
            default: 3,
            env: 'LLM_ANTHROPIC_CB_SUCCESS_THRESHOLD'
          },
          timeout: {
            doc: 'Circuit breaker timeout (ms)',
            format: 'nat',
            default: 60000,
            env: 'LLM_ANTHROPIC_CB_TIMEOUT'
          }
        },
        retry: {
          maxAttempts: {
            doc: 'Maximum retry attempts',
            format: 'nat',
            default: 3,
            env: 'LLM_ANTHROPIC_RETRY_MAX_ATTEMPTS'
          },
          initialDelay: {
            doc: 'Initial retry delay (ms)',
            format: 'nat',
            default: 1000,
            env: 'LLM_ANTHROPIC_RETRY_INITIAL_DELAY'
          },
          maxDelay: {
            doc: 'Maximum retry delay (ms)',
            format: 'nat',
            default: 30000,
            env: 'LLM_ANTHROPIC_RETRY_MAX_DELAY'
          },
          factor: {
            doc: 'Exponential backoff factor',
            format: Number,
            default: 2,
            env: 'LLM_ANTHROPIC_RETRY_FACTOR'
          }
        }
      },

      google: {
        name: {
          doc: 'Provider name',
          format: String,
          default: 'google'
        },
        type: {
          doc: 'Provider type',
          format: String,
          default: 'google'
        },
        enabled: {
          doc: 'Enable Google provider',
          format: Boolean,
          default: false,
          env: 'LLM_GOOGLE_ENABLED'
        },
        apiKey: {
          doc: 'Google API key',
          format: String,
          default: '',
          env: 'GOOGLE_API_KEY',
          sensitive: true
        },
        baseUrl: {
          doc: 'Google base URL',
          format: String,
          default: 'https://generativelanguage.googleapis.com/v1beta',
          env: 'LLM_GOOGLE_BASE_URL'
        },
        priority: {
          doc: 'Provider priority (higher = more preferred)',
          format: 'nat',
          default: 3,
          env: 'LLM_GOOGLE_PRIORITY'
        },
        circuitBreaker: {
          failureThreshold: {
            doc: 'Circuit breaker failure threshold',
            format: 'nat',
            default: 5,
            env: 'LLM_GOOGLE_CB_FAILURE_THRESHOLD'
          },
          successThreshold: {
            doc: 'Circuit breaker success threshold',
            format: 'nat',
            default: 3,
            env: 'LLM_GOOGLE_CB_SUCCESS_THRESHOLD'
          },
          timeout: {
            doc: 'Circuit breaker timeout (ms)',
            format: 'nat',
            default: 60000,
            env: 'LLM_GOOGLE_CB_TIMEOUT'
          }
        },
        retry: {
          maxAttempts: {
            doc: 'Maximum retry attempts',
            format: 'nat',
            default: 3,
            env: 'LLM_GOOGLE_RETRY_MAX_ATTEMPTS'
          },
          initialDelay: {
            doc: 'Initial retry delay (ms)',
            format: 'nat',
            default: 1000,
            env: 'LLM_GOOGLE_RETRY_INITIAL_DELAY'
          },
          maxDelay: {
            doc: 'Maximum retry delay (ms)',
            format: 'nat',
            default: 30000,
            env: 'LLM_GOOGLE_RETRY_MAX_DELAY'
          },
          factor: {
            doc: 'Exponential backoff factor',
            format: Number,
            default: 2,
            env: 'LLM_GOOGLE_RETRY_FACTOR'
          }
        }
      },

      ollama: {
        name: {
          doc: 'Provider name',
          format: String,
          default: 'ollama'
        },
        type: {
          doc: 'Provider type',
          format: String,
          default: 'ollama'
        },
        enabled: {
          doc: 'Enable Ollama provider',
          format: Boolean,
          default: true,
          env: 'LLM_OLLAMA_ENABLED'
        },
        baseUrl: {
          doc: 'Ollama base URL',
          format: String,
          default: 'http://localhost:11434',
          env: 'OLLAMA_BASE_URL'
        },
        priority: {
          doc: 'Provider priority (higher = more preferred)',
          format: 'nat',
          default: 4,
          env: 'LLM_OLLAMA_PRIORITY'
        },
        circuitBreaker: {
          failureThreshold: {
            doc: 'Circuit breaker failure threshold',
            format: 'nat',
            default: 3,
            env: 'LLM_OLLAMA_CB_FAILURE_THRESHOLD'
          },
          successThreshold: {
            doc: 'Circuit breaker success threshold',
            format: 'nat',
            default: 1,
            env: 'LLM_OLLAMA_CB_SUCCESS_THRESHOLD'
          },
          timeout: {
            doc: 'Circuit breaker timeout (ms)',
            format: 'nat',
            default: 10000,
            env: 'LLM_OLLAMA_CB_TIMEOUT'
          }
        },
        retry: {
          maxAttempts: {
            doc: 'Maximum retry attempts',
            format: 'nat',
            default: 2,
            env: 'LLM_OLLAMA_RETRY_MAX_ATTEMPTS'
          },
          initialDelay: {
            doc: 'Initial retry delay (ms)',
            format: 'nat',
            default: 500,
            env: 'LLM_OLLAMA_RETRY_INITIAL_DELAY'
          },
          maxDelay: {
            doc: 'Maximum retry delay (ms)',
            format: 'nat',
            default: 10000,
            env: 'LLM_OLLAMA_RETRY_MAX_DELAY'
          },
          factor: {
            doc: 'Exponential backoff factor',
            format: Number,
            default: 1.5,
            env: 'LLM_OLLAMA_RETRY_FACTOR'
          }
        }
      }
    }
  },

  // MCP Configuration
  mcp: {
    notion: {
      enabled: {
        doc: 'Enable Notion MCP integration',
        format: Boolean,
        default: false,
        env: 'MCP_NOTION_ENABLED'
      },
      apiKey: {
        doc: 'Notion API key',
        format: String,
        default: '',
        env: 'NOTION_API_KEY'
      }
    },
    
    jira: {
      enabled: {
        doc: 'Enable Jira MCP integration',
        format: Boolean,
        default: false,
        env: 'MCP_JIRA_ENABLED'
      },
      url: {
        doc: 'Jira instance URL',
        format: String,
        default: '',
        env: 'JIRA_URL'
      },
      username: {
        doc: 'Jira username/email',
        format: String,
        default: '',
        env: 'JIRA_USERNAME'
      },
      apiToken: {
        doc: 'Jira API token',
        format: String,
        default: '',
        env: 'JIRA_API_TOKEN'
      },
      projectKey: {
        doc: 'Jira project key',
        format: String,
        default: '',
        env: 'JIRA_PROJECT_KEY'
      }
    },
    
    google: {
      enabled: {
        doc: 'Enable Google Calendar MCP integration',
        format: Boolean,
        default: false,
        env: 'MCP_GOOGLE_ENABLED'
      },
      oauthCredentials: {
        doc: 'Google OAuth credentials (JSON string or file path)',
        format: String,
        default: '',
        env: 'GOOGLE_OAUTH_CREDENTIALS',
        sensitive: true
      },
      calendarId: {
        doc: 'Google Calendar ID',
        format: String,
        default: 'primary',
        env: 'GOOGLE_CALENDAR_ID'
      }
    }
  }
});

// Export the validated configuration
export default configSchema;