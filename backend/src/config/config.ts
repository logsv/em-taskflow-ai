import convict from 'convict';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Add YAML format support
convict.addFormat({
  name: 'yaml-file',
  validate: function(val: string) {
    if (typeof val !== 'string') {
      throw new Error('must be a string');
    }
  },
  coerce: function(val: string) {
    return val;
  }
});

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration schema
const config = convict({
  // Server Configuration
  server: {
    port: {
      doc: 'The port to bind',
      format: 'port',
      default: 4000,
      env: 'PORT'
    },
    host: {
      doc: 'The IP address to bind',
      format: String,
      default: '127.0.0.1',
      env: 'HOST'
    }
  },

  // Database Configuration  
  database: {
    path: {
      doc: 'SQLite database file path',
      format: String,
      default: './data/taskflow.db',
      env: 'DATABASE_PATH'
    }
  },

  // LLM Provider Configuration
  llm: {
    provider: {
      doc: 'Primary LLM provider',
      format: ['openai', 'anthropic', 'google', 'huggingface', 'ollama'],
      default: 'ollama',
      env: 'LLM_PROVIDER'
    },
    openai: {
      apiKey: {
        doc: 'OpenAI API Key',
        format: String,
        default: '',
        sensitive: true,
        env: 'OPENAI_API_KEY'
      }
    },
    anthropic: {
      apiKey: {
        doc: 'Anthropic API Key',
        format: String,
        default: '',
        sensitive: true,
        env: 'ANTHROPIC_API_KEY'
      }
    },
    google: {
      apiKey: {
        doc: 'Google AI API Key',
        format: String,
        default: '',
        sensitive: true,
        env: 'GOOGLE_API_KEY'
      }
    },
    huggingface: {
      apiKey: {
        doc: 'Hugging Face API Key',
        format: String,
        default: '',
        sensitive: true,
        env: 'HF_API_KEY'
      }
    },
    ollama: {
      baseUrl: {
        doc: 'Ollama base URL',
        format: String,
        default: 'http://localhost:11434',
        env: 'OLLAMA_BASE_URL'
      }
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

  // MCP Integration Configuration
  mcp: {
    notion: {
      apiKey: {
        doc: 'Notion API Key',
        format: String,
        default: '',
        sensitive: true,
        env: 'NOTION_API_KEY'
      },
      enabled: {
        doc: 'Enable Notion MCP integration',
        format: Boolean,
        default: false,
        env: 'NOTION_ENABLED'
      }
    },
    jira: {
      url: {
        doc: 'Jira instance URL',
        format: String,
        default: '',
        env: 'JIRA_URL'
      },
      username: {
        doc: 'Jira username',
        format: String,
        default: '',
        env: 'JIRA_USERNAME'
      },
      apiToken: {
        doc: 'Jira API token',
        format: String,
        default: '',
        sensitive: true,
        env: 'JIRA_API_TOKEN'
      },
      projectKey: {
        doc: 'Jira project key',
        format: String,
        default: '',
        env: 'JIRA_PROJECT_KEY'
      },
      enabled: {
        doc: 'Enable Jira MCP integration',
        format: Boolean,
        default: false,
        env: 'JIRA_ENABLED'
      }
    },
    google: {
      oauthCredentials: {
        doc: 'Google OAuth credentials JSON',
        format: String,
        default: '',
        sensitive: true,
        env: 'GOOGLE_OAUTH_CREDENTIALS'
      },
      calendarId: {
        doc: 'Google Calendar ID',
        format: String,
        default: 'primary',
        env: 'GOOGLE_CALENDAR_ID'
      },
      enabled: {
        doc: 'Enable Google Calendar MCP integration',
        format: Boolean,
        default: false,
        env: 'GOOGLE_ENABLED'
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
      doc: 'Default ChromaDB collection name',
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

  // Environment
  env: {
    doc: 'The application environment',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  }
});

// Load configuration files
const configDir = __dirname;
const defaultConfigFile = path.join(configDir, 'default.yml');
const envConfigFile = path.join(configDir, `${config.get('env')}.yml`);
const localConfigFile = path.join(configDir, 'local.yml');

// Load default configuration
if (fs.existsSync(defaultConfigFile)) {
  const defaultConfig = yaml.load(fs.readFileSync(defaultConfigFile, 'utf8'));
  config.load(defaultConfig as any);
  console.log('✅ Loaded default configuration from default.yml');
}

// Load environment-specific configuration if it exists
if (fs.existsSync(envConfigFile)) {
  const envConfig = yaml.load(fs.readFileSync(envConfigFile, 'utf8'));
  config.load(envConfig as any);
  console.log(`✅ Loaded ${config.get('env')} configuration from ${config.get('env')}.yml`);
}

// Load local configuration (highest priority, for developer-specific settings)
if (fs.existsSync(localConfigFile)) {
  const localConfig = yaml.load(fs.readFileSync(localConfigFile, 'utf8'));
  config.load(localConfig as any);
  console.log('✅ Loaded local configuration from local.yml');
}

// Validate configuration
config.validate({ allowed: 'strict' });

export default config;

// Type definitions for better TypeScript support
export interface Config {
  server: {
    port: number;
    host: string;
  };
  database: {
    path: string;
  };
  llm: {
    provider: 'openai' | 'anthropic' | 'google' | 'huggingface' | 'ollama';
    openai: {
      apiKey: string;
    };
    anthropic: {
      apiKey: string;
    };
    google: {
      apiKey: string;
    };
    huggingface: {
      apiKey: string;
    };
    ollama: {
      baseUrl: string;
    };
  };
  vectorDb: {
    chroma: {
      host: string;
      port: number;
    };
  };
  mcp: {
    notion: {
      apiKey: string;
      enabled: boolean;
    };
    jira: {
      url: string;
      username: string;
      apiToken: string;
      projectKey: string;
      enabled: boolean;
    };
    google: {
      oauthCredentials: string;
      calendarId: string;
      enabled: boolean;
    };
  };
  rag: {
    enabled: boolean;
    embeddingModel: string;
    defaultCollection: string;
    maxChunkSize: number;
  };
  env: 'production' | 'development' | 'test';
}