import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import v1Router from './routes/v1/index.js';
import { config, getServerConfig, getRuntimeConfig, getDatabaseConfig, getLlmConfig, getRagConfig, getAuthConfig, getWorkersConfig, validateConfig } from './config.js';
import dotenv from 'dotenv';
import { initializeLLM } from './llm/index.js';
import { initializeIngest } from './rag/index.js';
import { initSemanticCache } from './cache/semanticCache.js';
import { initFactMatrixRedis } from './services/sessionFactMatrix.js';
import db from './db/index.js';
import { attachRequestContext, createRateLimiter } from './middleware/hardening.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { background } from './core/safe.js';
import { info, warn, error } from './utils/logger.js';
import { startWorkers, stopWorkers } from './workers/runWorkers.js';
import { swallow, recordHandledError } from './core/safe.js';

let httpServer = null;

/** Remove the password from a connection URL before logging it. */
export function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[unparseable database url]';
  }
}

dotenv.config();


// Telemetry: OpenTelemetry (opt-in, OTEL_ENABLED=true, exports to OTEL_EXPORTER_OTLP_ENDPOINT)
// plus Langfuse for LLM traces. Metrics are exposed at /api/v1/metrics.
if (process.env.OTEL_ENABLED === 'true') {
  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-grpc');

    const otelSdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    otelSdk.start();
    info('Generic OpenTelemetry Node SDK & HTTP/Express auto-instrumentation started');
  } catch (err) {
    warn('OpenTelemetry Node SDK initialization warning', { err: err?.message || String(err) });
  }
}

const app = express();
const serverConfig = getServerConfig();
const PORT = serverConfig.port;

// Only the owner's frontend may call the API from a browser.
app.use(cors({ origin: serverConfig.frontendUrl, credentials: true }));
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

app.use('/api/v1', v1Router);
app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running.');
});

// Unknown /api routes get a JSON 404; every error that reaches Express gets a coded JSON body.
app.use('/api', notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    info('Validating configuration...');
    validateConfig();

    if (config.env === 'production' && !getAuthConfig().token) {
      error('AUTH_TOKEN is required in production. Set a random value of at least 24 characters in backend/.env (for example: openssl rand -hex 32).');
      process.exit(1);
    }
    if (!getAuthConfig().token) {
      warn('AUTH_TOKEN is not set: API authentication is DISABLED. Set AUTH_TOKEN in backend/.env before exposing this server.');
    }

    try {
      await db.initialize();
      info('Database service initialized at startup');
    } catch (e) {
      warn('Database initialization failed', { err: e.message });
    }

    try {
      await initializeLLM();
      info('LLM clients initialized at startup');
      // Pre-load the local model in the background so the first chat is not slow.
      background('llm.warmUp', async () => {
        const { warmUpModel } = await import('./llm/gateway.js');
        await warmUpModel();
      });
    } catch (e) {
      warn('LLM client initialization failed', { err: e.message });
    }

    try {
      await initializeIngest();
      info('RAG ingest pipeline initialized at startup');
    } catch (e) {
      warn('RAG ingest initialization failed', { err: e.message });
    }

    try {
      await initSemanticCache();
      info('Semantic cache initialized at startup');
    } catch (e) {
      warn('Semantic cache initialization failed (gracefully degraded)', { err: e.message });
    }

    try {
      await initFactMatrixRedis();
      info('Fact-Matrix Redis cache initialized at startup');
    } catch (e) {
      warn('Fact-Matrix Redis cache initialization failed (gracefully degraded)', { err: e.message });
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

    // Background workers run here only when WORKERS_IN_PROCESS=true (local default);
    // docker compose runs them in the separate `worker` service (src/worker.js).
    if (getWorkersConfig().inProcess) {
      await startWorkers();
    } else {
      info('Background workers are not started in the API process (WORKERS_IN_PROCESS=false)');
    }

    const databaseConfig = getDatabaseConfig();
    const llmConfig = getLlmConfig();
    const ragConfig = getRagConfig();

    httpServer = app.listen(PORT, serverConfig.host, () => {
      info(`EM TaskFlow AI server listening on ${serverConfig.host}:${PORT}`, {
        env: config.env,
        runtimeMode: runtimeConfig.mode,
        database: redactDatabaseUrl(databaseConfig.url),
        authEnabled: !!getAuthConfig().token,
        llmProvider: llmConfig.defaultProvider,
        ragEnabled: ragConfig.enabled,
        healthCheckUrl: `http://${serverConfig.host}:${PORT}/api/v1/health`,
        chatApiUrl: `http://${serverConfig.host}:${PORT}/api/v1/chat`,
        docsUrl: `http://${serverConfig.host}:${PORT}/api/v1/docs`,
      });
    });
  } catch (err) {
    error('Failed to initialize services', { err: err.message, stack: err.stack });
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  error('Uncaught Exception', { err: err?.message || String(err), stack: err?.stack });
});

process.on('unhandledRejection', (reason) => {
  error('Unhandled Promise Rejection', { reason: String(reason) });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info(`Received ${signal}, shutting down gracefully...`);
  const forceExit = setTimeout(() => {
    warn('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(() => resolve()));
    }
    await stopWorkers();
    await Promise.resolve(db.close());
    info('Services shut down successfully');
    process.exit(0);
  } catch (e) {
    error('Error during shutdown', { err: e.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
