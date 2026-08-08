import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { config, getServerConfig, getRuntimeConfig, getDatabaseConfig, getLlmConfig, getRagConfig, validateConfig } from './config.js';
import dotenv from 'dotenv';
import { initializeLLM } from './llm/index.js';
import { initializeIngest } from './rag/index.js';
import db from './db/index.js';
import { attachRequestContext, createRateLimiter } from './middleware/hardening.js';
import { info, warn, error } from './utils/logger.js';

dotenv.config();

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
    info('HTTP request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });
  next();
});

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running.');
});

async function startServer() {
  try {
    info('Validating configuration...');
    validateConfig();

    try {
      await db.initialize();
      info('Database service initialized at startup');
    } catch (e) {
      warn('Database initialization failed', { err: e.message });
    }

    try {
      await initializeLLM();
      info('LLM clients initialized at startup');
    } catch (e) {
      warn('LLM client initialization failed', { err: e.message });
    }

    try {
      await initializeIngest();
      info('RAG ingest pipeline initialized at startup');
    } catch (e) {
      warn('RAG ingest initialization failed', { err: e.message });
    }

    const runtimeConfig = getRuntimeConfig();
    if (runtimeConfig.mode === 'full') {
      try {
        const { initializeMCP } = await import('./mcp/index.js');
        await initializeMCP();
        info('MCP Service initialized at startup');
      } catch (e) {
        warn('MCP Service init at startup failed', { err: e.message });
      }

      try {
        const { default: langGraphAgentService } = await import('./agent/index.js');
        await langGraphAgentService.initialize();
        info('LangGraph Agent Service initialized successfully');
      } catch (agentError) {
        warn('LangGraph Agent Service initialization failed, will retry on first use', { err: agentError.message });
      }
    } else {
      info('Runtime mode is rag_only, skipping MCP and agent initialization');
    }

    const databaseConfig = getDatabaseConfig();
    const llmConfig = getLlmConfig();
    const ragConfig = getRagConfig();

    app.listen(PORT, serverConfig.host, () => {
      info(`EM TaskFlow AI server listening on ${serverConfig.host}:${PORT}`, {
        env: config.env,
        runtimeMode: runtimeConfig.mode,
        database: databaseConfig.url,
        llmProvider: llmConfig.defaultProvider,
        ragEnabled: ragConfig.enabled,
        healthCheckUrl: `http://${serverConfig.host}:${PORT}/api/health`,
        chatApiUrl: `http://${serverConfig.host}:${PORT}/api/chat`,
      });
    });
  } catch (err) {
    error('Failed to initialize services', { err: err.message, stack: err.stack });
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  info('Shutting down gracefully...');
  db.close();
  info('Services shut down successfully');
  process.exit(0);
});

startServer();
