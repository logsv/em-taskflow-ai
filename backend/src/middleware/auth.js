/**
 * Single-owner authentication (Phase 0).
 *
 * The deployment has exactly one user (the owner). Two ways to authenticate:
 *   1. `Authorization: Bearer <AUTH_TOKEN>` — scripts, CLIs, evaluation runners.
 *   2. A signed session cookie issued by POST /api/v1/auth/login — the browser UI.
 *
 * The cookie value is `<expiresAtMs>.<hmac>` where hmac = HMAC-SHA256(sha256(AUTH_TOKEN), "owner.<expiresAtMs>").
 * Rotating AUTH_TOKEN therefore invalidates every existing session.
 *
 * When AUTH_TOKEN is not configured, auth is disabled. That is only allowed outside
 * production; src/index.js refuses to start in production without a token.
 */
import crypto from 'crypto';
import { getAuthConfig, getServerConfig } from '../config.js';
import { warn } from '../utils/logger.js';

export const AUTH_COOKIE_NAME = 'emtf_owner';

function token() {
  return getAuthConfig()?.token || '';
}

export function isAuthEnabled() {
  return token().length > 0;
}

function signingKey() {
  return crypto.createHash('sha256').update(token()).digest();
}

function sign(expiresAtMs) {
  return crypto.createHmac('sha256', signingKey()).update(`owner.${expiresAtMs}`).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Constant-time comparison of a presented token with AUTH_TOKEN. */
export function isValidOwnerToken(presented) {
  if (!isAuthEnabled() || typeof presented !== 'string' || presented.length === 0) return false;
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(token()).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createSessionValue(now = Date.now()) {
  const ttlMs = (getAuthConfig()?.sessionTtlHours || 336) * 60 * 60 * 1000;
  const expiresAtMs = now + ttlMs;
  return { value: `${expiresAtMs}.${sign(expiresAtMs)}`, maxAgeSeconds: Math.floor(ttlMs / 1000) };
}

export function isValidSessionValue(value, now = Date.now()) {
  if (!isAuthEnabled() || typeof value !== 'string') return false;
  const [expiresRaw, mac] = value.split('.');
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs) || !mac || expiresAtMs <= now) return false;
  return safeEqual(mac, sign(expiresAtMs));
}

export function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function isSecureRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

export function buildSessionCookie(req, value, maxAgeSeconds) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearedSessionCookie(req) {
  const parts = [`${AUTH_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

/** Returns 'bearer' | 'cookie' | null for the credentials on this request. */
export function authenticateRequest(req) {
  const header = req.headers?.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return isValidOwnerToken(header.slice(7).trim()) ? 'bearer' : null;
  }
  const cookies = parseCookies(req.headers?.cookie);
  return isValidSessionValue(cookies[AUTH_COOKIE_NAME]) ? 'cookie' : null;
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cookie-authenticated state-changing requests must come from the frontend's origin
 * (or the API's own host). SameSite=Strict already blocks cross-site cookies in modern
 * browsers; this is defence in depth.
 */
function originAllowed(req) {
  const origin = req.headers?.origin;
  if (!origin) return true; // non-browser client, or same-origin request without Origin
  try {
    const originUrl = new URL(origin);
    const frontend = new URL(getServerConfig()?.frontendUrl || 'http://localhost:3000');
    if (originUrl.origin === frontend.origin) return true;
    const host = req.headers?.host;
    return !!host && originUrl.host === host;
  } catch {
    return false;
  }
}

/** Express middleware: every route mounted after this requires the owner. */
export function requireOwner(req, res, next) {
  if (!isAuthEnabled()) return next();

  const method = authenticateRequest(req);
  if (!method) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      requestId: req.requestId,
    });
  }

  if (method === 'cookie' && STATE_CHANGING.has(req.method) && !originAllowed(req)) {
    warn({ module: 'auth', action: 'originRejected', origin: req.headers?.origin, path: req.originalUrl }, 'Rejected cross-origin state-changing request');
    return res.status(403).json({
      error: 'Cross-origin request rejected',
      code: 'FORBIDDEN_ORIGIN',
      requestId: req.requestId,
    });
  }

  req.auth = { owner: true, method };
  return next();
}
