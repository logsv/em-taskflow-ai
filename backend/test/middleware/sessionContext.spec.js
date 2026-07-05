import sinon from 'sinon';
import db from '../../src/db/index.js';
import { attachSessionContext } from '../../src/middleware/sessionContext.js';

describe('attachSessionContext middleware', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('creates a new session, assigns an active thread, and sets a cookie', async () => {
    sinon.stub(db, 'getSession').resolves(null);
    sinon.stub(db, 'createSession').resolves({ id: 'sess_new' });
    sinon.stub(db, 'getOrCreateActiveThread').resolves({ id: 'th_new' });

    const req = {
      headers: {},
      ip: '127.0.0.1',
      protocol: 'http',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const setHeader = sinon.stub();
    const next = sinon.stub();
    const res = { setHeader };

    await attachSessionContext(req, res, next);

    expect(req.sessionContext).toEqual({
      sessionId: 'sess_new',
      threadId: 'th_new',
      created: true,
    });
    expect(setHeader.calledOnce).toBe(true);
    expect(setHeader.firstCall.args[0]).toBe('Set-Cookie');
    expect(setHeader.firstCall.args[1]).toContain('sid=sess_new');
    expect(next.calledOnceWithExactly()).toBe(true);
  });

  it('reuses x-session-id, touches the session, and skips recreating it', async () => {
    sinon.stub(db, 'getSession').resolves({ id: 'sess_existing', active_thread_id: 'th_existing' });
    const touchSessionStub = sinon.stub(db, 'touchSession').resolves();
    sinon.stub(db, 'getOrCreateActiveThread').resolves({ id: 'th_existing' });

    const req = {
      headers: { 'x-session-id': 'sess_existing' },
      ip: '127.0.0.1',
      protocol: 'http',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const setHeader = sinon.stub();
    const next = sinon.stub();
    const res = { setHeader };

    await attachSessionContext(req, res, next);

    expect(req.sessionContext).toEqual({
      sessionId: 'sess_existing',
      threadId: 'th_existing',
      created: false,
    });
    expect(touchSessionStub.calledOnceWithExactly('sess_existing')).toBe(true);
    expect(setHeader.calledOnce).toBe(true);
    expect(setHeader.firstCall.args[1]).toContain('sid=sess_existing');
    expect(next.calledOnceWithExactly()).toBe(true);
  });

  it('reuses a cookie-backed session without resetting the cookie header', async () => {
    sinon.stub(db, 'getSession').resolves({ id: 'sess_cookie', active_thread_id: 'th_cookie' });
    sinon.stub(db, 'touchSession').resolves();
    sinon.stub(db, 'getOrCreateActiveThread').resolves({ id: 'th_cookie' });

    const req = {
      headers: { cookie: 'sid=sess_cookie; theme=dark' },
      ip: '127.0.0.1',
      protocol: 'http',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const setHeader = sinon.stub();
    const next = sinon.stub();
    const res = { setHeader };

    await attachSessionContext(req, res, next);

    expect(req.sessionContext).toEqual({
      sessionId: 'sess_cookie',
      threadId: 'th_cookie',
      created: false,
    });
    expect(setHeader.called).toBe(false);
    expect(next.calledOnceWithExactly()).toBe(true);
  });

  it('passes errors to next when session resolution fails', async () => {
    const error = new Error('db unavailable');
    sinon.stub(db, 'getSession').rejects(error);

    const req = {
      headers: { 'x-session-id': 'sess_broken' },
      ip: '127.0.0.1',
      protocol: 'http',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const next = sinon.stub();

    await attachSessionContext(req, { setHeader: sinon.stub() }, next);

    expect(next.calledOnce).toBe(true);
    expect(next.firstCall.args[0]).toBe(error);
  });
});
