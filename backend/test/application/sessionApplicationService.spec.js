import { SessionApplicationService } from '../../src/application/session/SessionApplicationService.js';

describe('SessionApplicationService', () => {
  it('creates a new session and emits a cookie when no session identifiers exist', async () => {
    const dbService = {
      getSession: jasmine.createSpy('getSession'),
      createSession: jasmine.createSpy('createSession').and.resolveTo({ id: 'sess_new' }),
      touchSession: jasmine.createSpy('touchSession'),
      getOrCreateActiveThread: jasmine.createSpy('getOrCreateActiveThread').and.resolveTo({ id: 'th_new' }),
    };
    const service = new SessionApplicationService({ dbService });

    const result = await service.resolveSession({
      headers: {
        'user-agent': 'test-agent',
      },
      ip: '127.0.0.1',
      protocol: 'http',
      secure: false,
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(dbService.createSession).toHaveBeenCalledWith({
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });
    expect(dbService.getOrCreateActiveThread).toHaveBeenCalledWith('sess_new');
    expect(result).toEqual({
      sessionId: 'sess_new',
      threadId: 'th_new',
      created: true,
      cookieValue: jasmine.stringMatching(/sid=sess_new/),
    });
  });

  it('reuses an existing cookie-backed session without emitting a replacement cookie', async () => {
    const dbService = {
      getSession: jasmine.createSpy('getSession').and.resolveTo({ id: 'sess_cookie' }),
      createSession: jasmine.createSpy('createSession'),
      touchSession: jasmine.createSpy('touchSession').and.resolveTo(),
      getOrCreateActiveThread: jasmine.createSpy('getOrCreateActiveThread').and.resolveTo({ id: 'th_cookie' }),
    };
    const service = new SessionApplicationService({ dbService });

    const result = await service.resolveSession({
      headers: {
        cookie: 'sid=sess_cookie; theme=dark',
      },
      ip: '127.0.0.1',
      protocol: 'http',
      secure: false,
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(dbService.getSession).toHaveBeenCalledWith('sess_cookie');
    expect(dbService.touchSession).toHaveBeenCalledWith('sess_cookie');
    expect(dbService.createSession).not.toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: 'sess_cookie',
      threadId: 'th_cookie',
      created: false,
      cookieValue: null,
    });
  });

  it('accepts x-session-id when no cookie is present', async () => {
    const dbService = {
      getSession: jasmine.createSpy('getSession').and.resolveTo({ id: 'sess_header' }),
      createSession: jasmine.createSpy('createSession'),
      touchSession: jasmine.createSpy('touchSession').and.resolveTo(),
      getOrCreateActiveThread: jasmine.createSpy('getOrCreateActiveThread').and.resolveTo({ id: 'th_header' }),
    };
    const service = new SessionApplicationService({ dbService });

    const result = await service.resolveSession({
      headers: {
        'x-session-id': 'sess_header',
      },
      ip: '127.0.0.1',
      protocol: 'http',
      secure: false,
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(dbService.getSession).toHaveBeenCalledWith('sess_header');
    expect(result.sessionId).toBe('sess_header');
    expect(result.threadId).toBe('th_header');
    expect(result.cookieValue).toContain('sid=sess_header');
  });
});
