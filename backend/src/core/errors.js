/**
 * Error taxonomy. Code decides the HTTP status and the message the client sees; internal
 * details stay in logs. Throw AppError (or a subclass) from services; the error middleware
 * maps it. Anything else becomes INTERNAL with a generic message.
 */

export const ERROR_CODES = {
  VALIDATION: { status: 400, message: 'The request is invalid.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication required.' },
  FORBIDDEN: { status: 403, message: 'Not allowed.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  CONFLICT: { status: 409, message: 'Conflict.' },
  INTEGRATION_UNAUTHORIZED: { status: 502, message: 'An integration rejected its credentials. Reconnect it in Admin → Settings.' },
  INTEGRATION_UNAVAILABLE: { status: 503, message: 'An integration is unavailable right now.' },
  LLM_UNAVAILABLE: { status: 503, message: 'The language model is unavailable. Check that Ollama is running.' },
  LLM_TIMEOUT: { status: 504, message: 'The language model did not respond in time.' },
  DEPENDENCY_UNAVAILABLE: { status: 503, message: 'A required service is unavailable.' },
  RETRIEVAL_EMPTY: { status: 404, message: 'No matching documents were found.' },
  INTERNAL: { status: 500, message: 'Something went wrong. The error has been logged.' },
};

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} [message] client-safe message (defaults to the code's message)
   * @param {{ cause?: unknown, details?: unknown, retryable?: boolean }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message || ERROR_CODES[code]?.message || code);
    this.name = 'AppError';
    this.code = ERROR_CODES[code] ? code : 'INTERNAL';
    this.status = ERROR_CODES[this.code].status;
    this.details = opts.details;
    this.retryable = opts.retryable ?? (this.status >= 500);
    if (opts.cause) this.cause = opts.cause;
  }
}

/**
 * Best-effort classification of errors thrown by libraries (axios, pg, fetch, LLM clients)
 * into the taxonomy. Unknown errors are INTERNAL.
 */
export function classifyError(err) {
  if (err instanceof AppError) return err;
  const msg = String(err?.message || '');
  const status = err?.response?.status ?? err?.status;
  let code = 'INTERNAL';
  if (err?.name === 'ZodError') code = 'VALIDATION';
  else if (/timed? ?out|ETIMEDOUT|AbortError|TimeoutError/i.test(msg) || err?.name === 'TimeoutError') code = /llm|ollama|model/i.test(msg) ? 'LLM_TIMEOUT' : 'INTEGRATION_UNAVAILABLE';
  else if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg)) code = /11434|ollama/i.test(msg) ? 'LLM_UNAVAILABLE' : 'DEPENDENCY_UNAVAILABLE';
  else if (/LLM unavailable/i.test(msg)) code = 'LLM_UNAVAILABLE';
  else if (status === 401 || status === 403) code = 'INTEGRATION_UNAUTHORIZED';
  else if (status === 429 || (status >= 500 && status < 600)) code = 'INTEGRATION_UNAVAILABLE';
  else if (err?.code === 'ECONNREFUSED' || err?.code === '57P01' || err?.code === '3D000') code = 'DEPENDENCY_UNAVAILABLE';
  return new AppError(code, undefined, { cause: err });
}

/** JSON body for a client: code + safe message, never stack traces or raw library messages. */
export function toClientError(err, requestId = null) {
  const appErr = classifyError(err);
  return {
    status: appErr.status,
    body: {
      error: appErr.message,
      code: appErr.code,
      retryable: appErr.retryable,
      ...(appErr.code === 'VALIDATION' && appErr.details ? { details: appErr.details } : {}),
      requestId,
    },
  };
}
