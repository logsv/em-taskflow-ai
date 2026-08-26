import fs from 'fs';
import { Langfuse } from 'langfuse';
import { CallbackHandler as LangfuseCallbackHandler } from 'langfuse-langchain';
import { trace as otelTrace, context as otelContext } from '@opentelemetry/api';

let langfuseClientInstance = null;

/**
 * Auto-detects if execution is running inside a Docker container environment.
 * @returns {boolean}
 */
export function isDockerEnvironment() {
  try {
    return fs.existsSync('/.dockerenv');
  } catch (_err) {
    return false;
  }
}

/**
 * Resolves the appropriate Langfuse Base URL based on environment variables
 * and execution context (Docker bridge network vs Host machine loopback).
 * @returns {string}
 */
export function resolveLangfuseBaseUrl() {
  const inDocker = isDockerEnvironment();
  let baseUrl = process.env.LANGFUSE_HOST || (inDocker ? 'http://langfuse:3000' : 'http://localhost:3001');
  if (inDocker && baseUrl.includes('localhost')) {
    baseUrl = 'http://langfuse:3000';
  }
  return baseUrl;
}

/**
 * Returns a singleton instance of the native Langfuse JS SDK client if configured.
 * @returns {Langfuse|null}
 */
export function getLangfuseClient() {
  if (!process.env.LANGFUSE_PUBLIC_KEY) {
    return null;
  }
  if (!langfuseClientInstance) {
    const baseUrl = resolveLangfuseBaseUrl();
    langfuseClientInstance = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl,
    });
  }
  return langfuseClientInstance;
}

/**
 * Creates an End-to-End Root Request Trace across Langfuse
 * and returns the root trace alongside bound LangChain CallbackHandlers.
 * 
 * @param {Object} options Options containing name, query, sessionId, userId, tags, metadata
 * @returns {Object} { trace, callbacks }
 */
export function createEndToEndTrace(options = {}) {
  const client = getLangfuseClient();
  let trace = null;
  let callbacks = undefined;

  const sessionId = options.sessionId || options.threadId || (options.options && options.options.threadId) || undefined;
  const userId = options.userId || 'anonymous';
  const queryStr = typeof options.query === 'string' ? options.query : (options.input ? JSON.stringify(options.input) : '');

  // Initialize Langfuse Root Trace
  if (client) {
    try {
      trace = client.trace({
        name: options.name || `Chat Request: "${queryStr.slice(0, 40)}"`,
        sessionId: sessionId ? String(sessionId) : undefined,
        userId,
        tags: options.tags || ['em-taskflow', 'end-to-end'],
        input: options.query ? { query: options.query } : options.input,
        metadata: options.metadata || {},
      });

      const handler = new LangfuseCallbackHandler({ root: trace });
      callbacks = [handler];
      options.trace = trace;
      options.tracerCallbacks = callbacks;
    } catch (err) {
      console.warn('⚠️ Non-blocking Langfuse trace creation warning:', err.message);
    }
  }

  return { trace, callbacks };
}

/**
 * Safely creates a child span on a parent trace or span for Langfuse.
 * Returns a dummy span object if tracing is inactive to ensure calling code remains clean.
 * 
 * @param {Object|null} parent Trace or Span object
 * @param {string} name Span name
 * @param {Object} [input] Input metadata
 * @returns {Object} Span controller with .end({ output, metadata }) method
 */
export function createSpan(parent, name, input = {}) {
  let langfuseSpan = null;

  if (parent && typeof parent.span === 'function') {
    try {
      langfuseSpan = parent.span({ name, input });
    } catch (_err) {}
  }

  return {
    span: langfuseSpan,
    end: (data = {}) => {
      try {
        if (langfuseSpan && typeof langfuseSpan.end === 'function') {
          langfuseSpan.end({ output: data.output, metadata: data.metadata });
        }
      } catch (_err) {}
    },
  };
}

/**
 * Centralized tracer callback factory for LangChain and LangGraph telemetry.
 * 
 * @param {Object} options Options containing sessionId, threadId, userId, tags, trace, or cached tracerCallbacks
 * @returns {Array|undefined} Array of tracer callbacks or undefined if none configured
 */
export function getTracerCallbacks(options = {}) {
  if (options.tracerCallbacks) {
    return options.tracerCallbacks;
  }
  if (options.trace) {
    try {
      const handler = new LangfuseCallbackHandler({ root: options.trace });
      const res = [handler];
      options.tracerCallbacks = res;
      return res;
    } catch (_err) {}
  }

  const callbacks = [];
  try {
    const langfuseKey = process.env.LANGFUSE_PUBLIC_KEY;
    if (langfuseKey) {
      const baseUrl = resolveLangfuseBaseUrl();
      const sessionId = options.sessionId || options.threadId || (options.options && options.options.threadId) || undefined;
      callbacks.push(new LangfuseCallbackHandler({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl,
        sessionId: sessionId ? String(sessionId) : undefined,
        userId: options.userId || 'anonymous',
        tags: options.tags || ['em-taskflow'],
      }));
    }
  } catch (err) {
    console.warn('⚠️ Non-blocking tracer initialization warning:', err.message);
  }
  const res = callbacks.length > 0 ? callbacks : undefined;
  options.tracerCallbacks = res;
  return res;
}

/**
 * Safely attaches evaluation metric scores to live trace spans in langfuse_db.
 * @param {Object} options { traceId, name, value, comment }
 * @returns {boolean} Success status
 */
export function scoreTrace(options = {}) {
  const client = getLangfuseClient();
  if (!client || !options.traceId || !options.name) {
    return false;
  }
  try {
    client.score({
      traceId: options.traceId,
      name: options.name,
      value: options.value ?? 1,
      comment: options.comment || 'Evaluation framework metric score',
    });
    return true;
  } catch (err) {
    console.warn('⚠️ Non-blocking trace score warning:', err.message);
    return false;
  }
}

