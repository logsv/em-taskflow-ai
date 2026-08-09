import pino from 'pino';

const transport = process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET
  ? pino.transport({
      target: '@axiomhq/pino',
      options: {
        dataset: process.env.AXIOM_DATASET || 'em-taskflow-logs',
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
