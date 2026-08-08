import loglevel from 'loglevel';

// Configure default loglevel
const isProd = import.meta.env?.PROD ?? false;
loglevel.setLevel(isProd ? 'warn' : 'info');

function formatMessage(level, message, details) {
  const logEvent = {
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message),
  };
  if (details !== undefined) {
    logEvent.details = details;
  }
  return logEvent;
}

const logger = {
  info(message, details) {
    loglevel.info(formatMessage('INFO', message, details));
  },
  warn(message, details) {
    loglevel.warn(formatMessage('WARN', message, details));
  },
  error(message, details) {
    loglevel.error(formatMessage('ERROR', message, details));
  },
  debug(message, details) {
    loglevel.debug(formatMessage('DEBUG', message, details));
  },
  setLevel(level) {
    loglevel.setLevel(level);
  },
};

export { logger };
export default logger;
