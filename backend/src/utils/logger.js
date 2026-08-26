import pino from 'pino';
import * as Sentry from '@sentry/node';

const transport = process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET
  ? pino.transport({
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET || 'emtaskflowai',
        token: process.env.AXIOM_TOKEN,
      },
    })
  : undefined;

const pinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'em-taskflow-backend' },
  },
  transport
);

function normalizeArgs(first, second) {
  if (first instanceof Error) {
    return [{ err: { message: first.message, stack: first.stack, name: first.name }, ...(typeof second === 'object' && second !== null ? second : {}) }, first.message];
  }
  if (typeof first === 'object' && first !== null) {
    const msg = typeof second === 'string' ? second : (first.message || first.msg || '');
    return [first, msg];
  }
  if (typeof first === 'string') {
    if (typeof second === 'object' && second !== null) {
      return [second, first];
    }
    return [{}, first];
  }
  return [{}, String(first ?? '')];
}

function info(message, meta = {}) {
  const [ctx, msg] = normalizeArgs(message, meta);
  pinoLogger.info(ctx, msg);
}

function log(message, meta = {}) {
  info(message, meta);
}

function error(message, meta = {}) {
  const [ctx, msg] = normalizeArgs(message, meta);
  pinoLogger.error(ctx, msg);

  if (process.env.SENTRY_DSN) {
    try {
      const errObj = ctx?.err || ctx?.error || (message instanceof Error ? message : new Error(msg || 'Unknown Error'));
      Sentry.captureException(errObj, { extra: ctx });
    } catch (_) {
      // Prevent Sentry capture failure from interrupting logging
    }
  }
}

function warn(message, meta = {}) {
  const [ctx, msg] = normalizeArgs(message, meta);
  pinoLogger.warn(ctx, msg);
}

function debug(message, meta = {}) {
  const [ctx, msg] = normalizeArgs(message, meta);
  pinoLogger.debug(ctx, msg);
}

/**
 * Express HTTP Request logging middleware emitting structured JSON logs.
 */
function httpRequestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const logFn = level === 'error' ? error : level === 'warn' ? warn : info;
    logFn({
      module: 'http',
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip || req.socket?.remoteAddress,
    }, `${req.method} ${req.originalUrl || req.url} ${res.statusCode} (${durationMs}ms)`);
  });
  next();
}

export { log, info, error, warn, debug, pinoLogger as logger, httpRequestLogger };
export default pinoLogger;

