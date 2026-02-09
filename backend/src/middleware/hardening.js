import crypto from 'crypto';

const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const requestBuckets = new Map();

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function attachRequestContext(req, res, next) {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

export function createRateLimiter() {
  return (req, res, next) => {
    const now = Date.now();
    const key = clientKey(req);
    const existing = requestBuckets.get(key);

    if (!existing || now > existing.resetAt) {
      requestBuckets.set(key, {
        count: 1,
        resetAt: now + REQUEST_WINDOW_MS,
      });
      return next();
    }

    if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('retry-after', String(Math.max(1, retryAfterSeconds)));
      return res.status(429).json({
        error: 'Too many requests',
        requestId: req.requestId,
      });
    }

    existing.count += 1;
    return next();
  };
}
