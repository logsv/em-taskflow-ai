import db from '../../db/index.js';

const SESSION_COOKIE_NAME = 'sid';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export class SessionApplicationService {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  async resolveSession({ headers = {}, ip = null, protocol = 'http', secure = false, socket = null }) {
    const cookies = parseCookies(headers.cookie);
    const cookieSessionId = cookies[SESSION_COOKIE_NAME] || null;
    const headerSessionId = getHeaderSessionId(headers['x-session-id']);
    const requestedSessionId = cookieSessionId || headerSessionId || null;
    const clientInfo = {
      ip: ip || socket?.remoteAddress || null,
      userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : null,
    };

    let session = null;
    let created = false;

    if (requestedSessionId) {
      session = await this.db.getSession(requestedSessionId);
    }

    if (!session) {
      session = await this.db.createSession(clientInfo);
      created = true;
    } else {
      await this.db.touchSession(session.id);
    }

    const thread = await this.db.getOrCreateActiveThread(session.id);
    const cookieValue =
      cookieSessionId !== session.id
        ? buildSessionCookie(session.id, secure || protocol === 'https')
        : null;

    return {
      sessionId: session.id,
      threadId: thread.id,
      created,
      cookieValue,
    };
  }
}

const sessionApplicationService = new SessionApplicationService();
export default sessionApplicationService;

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
