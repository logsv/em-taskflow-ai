import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { config, getServerConfig, getRuntimeConfig, getDatabaseConfig, getLlmConfig, getRagConfig, validateConfig } from './config.js';
import dotenv from 'dotenv';
import { initializeLLM } from './llm/index.js';
import { initializeIngest } from './rag/index.js';
import db from './db/index.js';
import { attachRequestContext, createRateLimiter } from './middleware/hardening.js';

dotenv.config();

// Automatically enable LangChain / LangSmith V2 Tracing across all agents, router, and supervisor
const langsmithKey = process.env.LANGCHAIN_API_KEY || process.env.LANGSMITH_API_KEY;
if (langsmithKey) {
  process.env.LANGCHAIN_TRACING_V2 = "true";
  process.env.LANGCHAIN_API_KEY = langsmithKey;
  process.env.LANGCHAIN_ENDPOINT = process.env.LANGCHAIN_ENDPOINT || "https://api.smith.langchain.com";
  process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || process.env.LANGSMITH_PROJECT || "em-taskflow-ai";
  console.log(`📡 [LANGSMITH TRACING]: Enabled automatic LangChain V2 tracing for project "${process.env.LANGCHAIN_PROJECT}"`);
}

const app = express();
const serverConfig = getServerConfig();
const PORT = serverConfig.port;

app.use(cors());
app.use(attachRequestContext);
app.use(createRateLimiter());
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[${req.requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`,
    );
  });
  next();
});

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running.');
});

async function startServer() {
  try {
    console.log('🔍 Validating configuration...');
    validateConfig();

    try {
      await db.initialize();
      console.log('✅ Database service initialized at startup');
    } catch (e) {
      console.warn('⚠️ Database initialization failed:', e);
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

    const runtimeConfig = getRuntimeConfig();
    if (runtimeConfig.mode === 'full') {
      try {
        const { initializeMCP } = await import('./mcp/index.js');
        await initializeMCP();
        console.log('✅ MCP Service initialized at startup');
      } catch (e) {
        console.warn('⚠️ MCP Service init at startup failed:', e);
      }

      try {
        const { default: langGraphAgentService } = await import('./agent/index.js');
        await langGraphAgentService.initialize();
        console.log('✅ LangGraph Agent Service initialized successfully');
      } catch (agentError) {
        console.warn('⚠️ LangGraph Agent Service initialization failed, will retry on first use:', agentError);
      }
    } else {
      console.log('ℹ️ Runtime mode is rag_only, skipping MCP and agent initialization');
    }

    const databaseConfig = getDatabaseConfig();
    const llmConfig = getLlmConfig();
    const ragConfig = getRagConfig();

    app.listen(PORT, serverConfig.host, () => {
      console.log(`🚀 EM TaskFlow AI server listening on ${serverConfig.host}:${PORT}`);
      console.log(`📊 Environment: ${config.env}`);
      console.log(`🧭 Runtime mode: ${runtimeConfig.mode}`);
      console.log(`💾 Database: ${databaseConfig.url}`);
      console.log(`🤖 LLM Provider: ${llmConfig.defaultProvider}`);
      console.log(`🔍 RAG Enabled: ${ragConfig.enabled}`);
      console.log(`🔗 Health check: http://${serverConfig.host}:${PORT}/api/health`);
      console.log(`💬 Chat API: POST http://${serverConfig.host}:${PORT}/api/chat`);
    });
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  console.log('✅ Services shut down successfully');
  process.exit(0);
});

startServer();
