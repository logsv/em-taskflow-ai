/**
 * One place that turns errors into HTTP responses.
 * - sendError(req, res, err, context): for route-level catch blocks
 * - errorHandler: Express error middleware (mounted last in index.js)
 * Clients get a code and a safe message; the full error goes to the log with the request id.
 */
import { toClientError, classifyError } from '../core/errors.js';
import { incCounter } from '../core/metrics.js';
import { error as logError, warn } from '../utils/logger.js';

export function sendError(req, res, err, context = 'request') {
  const { status, body } = toClientError(err, req?.requestId || null);
  const log = status >= 500 ? logError : warn;
  log({
    module: 'http',
    action: 'error',
    context,
    code: body.code,
    status,
    requestId: req?.requestId,
    path: req?.originalUrl,
    err: err?.message || String(err),
    stack: status >= 500 ? err?.stack : undefined,
  }, `${context} failed: ${body.code}`);
  incCounter('http_errors_total', { code: body.code, status: String(status) }, 1, 'HTTP error responses by code');
  if (res.headersSent) return undefined;
  return res.status(status).json(body);
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.parse.failed') {
    return sendError(req, res, Object.assign(classifyError(err), { code: 'VALIDATION', status: 400, message: 'Malformed JSON body.' }), 'body-parser');
  }
  return sendError(req, res, err, 'unhandled');
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND', requestId: req.requestId });
}
