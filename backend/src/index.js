import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';
import { config, getServerConfig, getRuntimeConfig, getDatabaseConfig, getLlmConfig, getRagConfig, validateConfig } from './config.js';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { initializeLLM } from './llm/index.js';
import { initializeIngest } from './rag/index.js';
import { initSemanticCache } from './cache/semanticCache.js';
import db from './db/index.js';
import { attachRequestContext, createRateLimiter } from './middleware/hardening.js';
import { info, warn, error } from './utils/logger.js';

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

// NOTE: Phoenix register() also uses import-in-the-middle which conflicts with
// newrelic/esm-loader.mjs. Enable only when New Relic is NOT active.
// Enable Phoenix OpenInference & LangChain tracing by default unless explicitly disabled
if (process.env.PHOENIX_ENABLED !== 'false') {
  try {
    const { register } = await import('@arizeai/phoenix-otel');
    const { LangChainInstrumentation } = await import('@arizeai/openinference-instrumentation-langchain');
    const { SamplingDecision } = await import('@opentelemetry/sdk-trace-base');
    const CallbackManagerModule = await import('@langchain/core/callbacks/manager');

    class AIOnlySampler {
      shouldSample(context, traceId, spanName, spanKind, attributes, links) {
        const name = String(spanName || '');
        const url = String(attributes?.['http.target'] || attributes?.['http.url'] || attributes?.['url.path'] || attributes?.['http.route'] || '');
        const isHttpSpan = name.startsWith('GET') || name.startsWith('POST') || name.startsWith('HTTP') || Boolean(attributes?.['http.method']);
        
        // Suppress non-AI HTTP routes (health checks, session polling, admin probes, static endpoints)
        if (isHttpSpan) {
          const isAiRoute = name.includes('/api/chat') || url.includes('/api/chat') || name.includes('/rag/query') || url.includes('/rag/query') || name.includes('/agent') || url.includes('/agent');
          if (!isAiRoute) {
            return { decision: SamplingDecision.NOT_RECORD };
          }
        }
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
      }
      toString() {
        return 'AIOnlySampler';
      }
    }

    // Pass AIOnlySampler and instrumentations: [] to trace LLM/LangChain executions only
    // and exclude generic HTTP polling and health check pings from cluttering Phoenix
    register({
      projectName: process.env.PHOENIX_PROJECT_NAME || process.env.LANGCHAIN_PROJECT || 'emtaskflow',
      endpoint: process.env.PHOENIX_COLLECTOR_ENDPOINT || 'http://127.0.0.1:6006/v1/traces',
      instrumentations: [],
      sampler: new AIOnlySampler(),
    });

    const lcInstrumentation = new LangChainInstrumentation();
    lcInstrumentation.manuallyInstrument(CallbackManagerModule);

    info('Arize Phoenix OpenInference & LangChain instrumentation initialized successfully');
  } catch (err) {
    try {
      const traceloop = await import('@traceloop/node-server-sdk');
      traceloop.initialize({
        appName: 'em-taskflow-ai',
        baseUrl: process.env.PHOENIX_OTLP_URL || 'http://localhost:4317',
        disableBatch: process.env.NODE_ENV === 'test',
      });
      info('OpenLLMetry initialized targeting local Arize Phoenix');
    } catch (fallbackErr) {
      warn('Phoenix initialization warning', { err: fallbackErr?.message || String(fallbackErr) });
    }
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
