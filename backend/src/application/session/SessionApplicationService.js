import sessionRepository from '../../persistence/session/SessionRepository.js';

const SESSION_COOKIE_NAME = 'sid';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export class SessionApplicationService {
  constructor({ sessionRepo = null, dbService = null } = {}) {
    this.sessionRepo = sessionRepo || createSessionRepoAdapter(dbService);
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
      session = await this.sessionRepo.getSession(requestedSessionId);
    }

    if (!session) {
      session = await this.sessionRepo.createSession(clientInfo);
      created = true;
    } else {
      await this.sessionRepo.touchSession(session.id);
    }

    const thread = await this.sessionRepo.getOrCreateActiveThread(session.id);
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

function createSessionRepoAdapter(dbService) {
  if (!dbService) {
    return sessionRepository;
  }

  return {
    getSession: (...args) => dbService.getSession(...args),
    createSession: (...args) => dbService.createSession(...args),
    touchSession: (...args) => dbService.touchSession(...args),
    getOrCreateActiveThread: (...args) => dbService.getOrCreateActiveThread(...args),
  };
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
