import fs from 'fs';
import { Langfuse } from 'langfuse';
import { CallbackHandler as LangfuseCallbackHandler } from 'langfuse-langchain';

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
 * Creates an End-to-End Root Request Trace in Langfuse and returns the root trace
 * alongside a bound LangChain CallbackHandler that nests all downstream operations under this trace.
 * 
 * @param {Object} options Options containing name, query, sessionId, userId, tags, metadata
 * @returns {Object} { trace, callbacks }
 */
export function createEndToEndTrace(options = {}) {
  const client = getLangfuseClient();
  if (!client) {
    return { trace: null, callbacks: undefined };
  }

  try {
    const sessionId = options.sessionId || options.threadId || (options.options && options.options.threadId) || undefined;
    const trace = client.trace({
      name: options.name || `Chat Request: "${(options.query || '').slice(0, 40)}"`,
      sessionId: sessionId ? String(sessionId) : undefined,
      userId: options.userId || 'user_logsv',
      tags: options.tags || ['em-taskflow', 'end-to-end'],
      input: options.query ? { query: options.query } : options.input,
      metadata: options.metadata || {},
    });

    const handler = new LangfuseCallbackHandler({ root: trace });
    const callbacks = [handler];
    options.trace = trace;
    options.tracerCallbacks = callbacks;

    return { trace, callbacks };
  } catch (err) {
    console.warn('⚠️ Non-blocking trace creation warning:', err.message);
    return { trace: null, callbacks: undefined };
  }
}

/**
 * Safely creates a child span on a parent trace or span.
 * Returns a dummy span object if tracing is inactive to ensure calling code remains clean.
 * 
 * @param {Object|null} parent Trace or Span object
 * @param {string} name Span name
 * @param {Object} [input] Input metadata
 * @returns {Object} Span controller with .end({ output, metadata }) method
 */
export function createSpan(parent, name, input = {}) {
  if (parent && typeof parent.span === 'function') {
    try {
      const spanObj = parent.span({ name, input });
      return {
        span: spanObj,
        end: (data = {}) => {
          try {
            if (spanObj && typeof spanObj.end === 'function') {
              spanObj.end({ output: data.output, metadata: data.metadata });
            }
          } catch (_err) {}
        },
      };
    } catch (_err) {}
  }
  return { span: null, end: () => {} };
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
        userId: options.userId || 'user_logsv',
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
