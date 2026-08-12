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

function info(message, meta = {}) {
  if (typeof message === 'object' && message !== null) {
    pinoLogger.info(message);
  } else {
    pinoLogger.info(meta, message ?? '');
  }
}

function log(message, meta = {}) {
  info(message, meta);
}

function error(message, meta = {}) {
  if (typeof message === 'object' && message !== null) {
    pinoLogger.error(message);
  } else {
    pinoLogger.error(meta, message ?? '');
  }

  if (process.env.SENTRY_DSN) {
    try {
      const errObj = meta?.err || meta?.error || (message instanceof Error ? message : new Error(typeof message === 'string' ? message : 'Unknown Error'));
      Sentry.captureException(errObj, { extra: typeof meta === 'object' ? meta : { meta } });
    } catch (_) {
      // Prevent Sentry capture failure from interrupting logging
    }
  }
}

function warn(message, meta = {}) {
  if (typeof message === 'object' && message !== null) {
    pinoLogger.warn(message);
  } else {
    pinoLogger.warn(meta, message ?? '');
  }
}

function debug(message, meta = {}) {
  if (typeof message === 'object' && message !== null) {
    pinoLogger.debug(message);
  } else {
    pinoLogger.debug(meta, message ?? '');
  }
}

export { log, info, error, warn, debug, pinoLogger as logger };
export default pinoLogger;
