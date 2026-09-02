import './tracing.js';
import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import v1Router from './routes/v1/index.js';
import { config, getServerConfig, getRuntimeConfig, getDatabaseConfig, getLlmConfig, getRagConfig, validateConfig } from './config.js';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { initializeLLM } from './llm/index.js';
import { initializeIngest } from './rag/index.js';
import { initSemanticCache } from './cache/semanticCache.js';
import { initFactMatrixRedis } from './services/sessionFactMatrix.js';
import db from './db/index.js';
import { attachRequestContext, createRateLimiter } from './middleware/hardening.js';
import { info, warn, error } from './utils/logger.js';
import teamSyncWorker from './workers/teamSyncWorker.js';

dotenv.config();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

// NOTE: Generic OTel auto-instrumentation is disabled by default because
// newrelic/esm-loader.mjs and @opentelemetry/auto-instrumentations-node both
// register 'import-in-the-middle' hooks which conflict in Node.js ESM mode.
// New Relic APM handles HTTP/Express instrumentation natively.
// Set OTEL_ENABLED=true only when running without New Relic.
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

if (process.env.SENTRY_DSN) {
  if (Sentry.Handlers?.requestHandler) {
    app.use(Sentry.Handlers.requestHandler());
  }
}

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

app.use('/api/v1', v1Router);
app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow AI is running.');
});

if (process.env.SENTRY_DSN) {
  if (Sentry.Handlers?.errorHandler) {
    app.use(Sentry.Handlers.errorHandler());
  }
}

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

    // Start Node.js background team sync worker & Temporal Node Worker
    try {
      teamSyncWorker.start();
      const { startTemporalNodeWorker } = await import('./temporal/worker.js');
      await startTemporalNodeWorker();
    } catch (workerErr) {
      warn('Background workers start warning', { err: workerErr.message });
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
  if (process.env.SENTRY_DSN) {
    try { Sentry.captureException(err); } catch (_) {}
  }
  error('Uncaught Exception', { err: err?.message || String(err), stack: err?.stack });
});

process.on('unhandledRejection', (reason) => {
  if (process.env.SENTRY_DSN) {
    try { Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason))); } catch (_) {}
  }
  error('Unhandled Promise Rejection', { reason: String(reason) });
});

process.on('SIGINT', () => {
  info('Shutting down gracefully...');
  db.close();
  info('Services shut down successfully');
  process.exit(0);
});

startServer();
