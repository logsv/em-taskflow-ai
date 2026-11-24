import express from 'express';
import { z } from 'zod';
import {
  isAuthEnabled,
  isValidOwnerToken,
  authenticateRequest,
  createSessionValue,
  buildSessionCookie,
  buildClearedSessionCookie,
} from '../../middleware/auth.js';
import { warn, info } from '../../utils/logger.js';

const router = express.Router();

const loginSchema = z.object({
  token: z.string().min(1).max(512),
});

// Brute-force protection for the single owner token: 10 failures per 15 minutes per client.
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map();

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function recentFailures(key, now) {
  const entry = failures.get(key);
  if (!entry || now - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return 0;
  }
  return entry.count;
}

function recordFailure(key, now) {
  const entry = failures.get(key);
  if (!entry || now - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

export function resetLoginThrottle() {
  failures.clear();
}

// GET /api/v1/auth/status — public: tells the UI whether a login is needed.
router.get('/auth/status', (req, res) => {
  const enabled = isAuthEnabled();
  res.json({
    authEnabled: enabled,
    authenticated: enabled ? !!authenticateRequest(req) : true,
    requestId: req.requestId,
  });
});

// POST /api/v1/auth/login — exchange the owner token for a session cookie.
router.post('/auth/login', (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({ success: true, authEnabled: false, requestId: req.requestId });
  }

  const now = Date.now();
  const key = clientKey(req);
  if (recentFailures(key, now) >= MAX_FAILURES) {
    res.setHeader('retry-after', String(Math.ceil(FAILURE_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Too many failed login attempts', code: 'LOGIN_THROTTLED', requestId: req.requestId });
  }

  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success || !isValidOwnerToken(parsed.data.token)) {
    recordFailure(key, now);
    warn({ module: 'auth', action: 'loginFailed', client: key }, 'Owner login failed');
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_CREDENTIALS', requestId: req.requestId });
  }

  failures.delete(key);
  const { value, maxAgeSeconds } = createSessionValue(now);
  res.setHeader('Set-Cookie', buildSessionCookie(req, value, maxAgeSeconds));
  info({ module: 'auth', action: 'loginSucceeded' }, 'Owner logged in');
  return res.json({ success: true, authEnabled: true, expiresInSeconds: maxAgeSeconds, requestId: req.requestId });
});

// POST /api/v1/auth/logout — clear the session cookie.
router.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', buildClearedSessionCookie(req));
  res.json({ success: true, requestId: req.requestId });
});

export default router;
