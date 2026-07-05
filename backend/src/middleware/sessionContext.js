import db from '../db/index.js';

const SESSION_COOKIE_NAME = 'sid';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function attachSessionContext(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const cookieSessionId = cookies[SESSION_COOKIE_NAME] || null;
    const headerSessionId = getHeaderSessionId(req.headers['x-session-id']);
    const requestedSessionId = cookieSessionId || headerSessionId || null;
    const clientInfo = {
      ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    };

    let session = null;
    let created = false;

    if (requestedSessionId) {
      session = await db.getSession(requestedSessionId);
    }

    if (!session) {
      session = await db.createSession(clientInfo);
      created = true;
    } else {
      await db.touchSession(session.id);
    }

    const thread = await db.getOrCreateActiveThread(session.id);
    req.sessionContext = {
      sessionId: session.id,
      threadId: thread.id,
      created,
    };

    if (cookieSessionId !== session.id) {
      res.setHeader('Set-Cookie', buildSessionCookie(session.id, req.secure || req.protocol === 'https'));
    }

    next();
  } catch (error) {
    next(error);
  }
}

function getHeaderSessionId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseCookies(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return {};
  }

  return headerValue
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 0) {
        return acc;
      }
      const name = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      acc[name] = value;
      return acc;
    }, {});
}

function buildSessionCookie(sessionId, secure) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

