import sessionApplicationService from '../application/session/SessionApplicationService.js';

export async function attachSessionContext(req, res, next) {
  try {
    const sessionContext = await sessionApplicationService.resolveSession({
      headers: req.headers,
      ip: req.ip,
      protocol: req.protocol,
      secure: req.secure,
      socket: req.socket,
    });
    req.sessionContext = {
      sessionId: sessionContext.sessionId,
      threadId: sessionContext.threadId,
      created: sessionContext.created,
    };

    if (sessionContext.cookieValue) {
      res.setHeader('Set-Cookie', sessionContext.cookieValue);
    }

    next();
  } catch (error) {
    next(error);
  }
}
