import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { config, getServerConfig, getMcpConfig, getDatabaseConfig, getLlmConfig, getRagConfig, validateConfig } from './config.js';
import dotenv from 'dotenv';
import { initializeMCP } from './mcp/index.js';
import langGraphAgentService from './agent/index.js';
import { initializeLLM, initializeLLMRouter } from './llm/index.js';
import { initializeIngest } from './rag/index.js';

dotenv.config();

const app = express();
const serverConfig = getServerConfig();
const PORT = serverConfig.port;

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running with SQLite database.');
});

async function startServer() {
  try {
    console.log('🔍 Validating configuration...');
    validateConfig();

    console.log('⚠️  Database service disabled for testing');

    try {
      const mcpConfig = getMcpConfig();
      const notionEnabled = mcpConfig.notion.enabled;
      const notionKeyLen = mcpConfig.notion.apiKey?.length || 0;
      console.log('🔧 Notion config at startup - enabled:', notionEnabled, 'key length:', notionKeyLen);
    } catch (e) {
      console.warn('⚠️ Could not read Notion config:', e);
    }

    try {
      await initializeLLM();
      console.log('✅ LLM clients initialized at startup');
    } catch (e) {
      console.warn('⚠️ LLM client initialization failed:', e);
    }

    try {
      await initializeIngest();
      console.log('✅ RAG ingest pipeline initialized at startup');
    } catch (e) {
      console.warn('⚠️ RAG ingest initialization failed:', e);
    }

    try {
      await initializeMCP();
      console.log('✅ MCP Service initialized at startup');
    } catch (e) {
      console.warn('⚠️ MCP Service init at startup failed:', e);
    }

    try {
      await langGraphAgentService.initialize();
      console.log('✅ LangGraph Agent Service initialized successfully');
    } catch (agentError) {
      console.warn('⚠️ LangGraph Agent Service initialization failed, will retry on first use:', agentError);
    }

    const databaseConfig = getDatabaseConfig();
    const llmConfig = getLlmConfig();
    const ragConfig = getRagConfig();

    app.listen(PORT, serverConfig.host, () => {
      console.log(`🚀 EM TaskFlow AI server listening on ${serverConfig.host}:${PORT}`);
      console.log(`📊 Environment: ${config.env}`);
      console.log(`💾 Database: ${databaseConfig.path}`);
      console.log(`🤖 LLM Provider: ${llmConfig.defaultProvider}`);
      console.log(`🔍 RAG Enabled: ${ragConfig.enabled}`);
      console.log(`🔗 Health check: http://${serverConfig.host}:${PORT}/api/health`);
      console.log(`📈 LLM status: http://${serverConfig.host}:${PORT}/api/llm-status`);
    });
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  console.log('✅ Services shut down successfully');
  process.exit(0);
});

startServer();

