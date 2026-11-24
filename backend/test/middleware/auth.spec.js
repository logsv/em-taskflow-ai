import express from 'express';
import request from 'supertest';
import { config } from '../../src/config.js';
import {
  requireOwner,
  isAuthEnabled,
  isValidOwnerToken,
  createSessionValue,
  isValidSessionValue,
  AUTH_COOKIE_NAME,
} from '../../src/middleware/auth.js';
import authRouter, { resetLoginThrottle } from '../../src/routes/v1/auth.js';

const TOKEN = 'owner-test-token-0123456789abcdef';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/public', (req, res) => res.json({ ok: true }));
  app.use('/api/v1', authRouter);
  app.use(requireOwner);
  app.get('/private', (req, res) => res.json({ ok: true, method: req.auth?.method || 'disabled' }));
  app.post('/private', (req, res) => res.json({ ok: true }));
  return app;
}

function cookieFrom(res) {
  const raw = res.headers['set-cookie'] || [];
  const match = raw.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  return match ? match.split(';')[0] : null;
}

describe('Single-owner auth', () => {
  let savedToken;

  beforeEach(() => {
    savedToken = config.auth.token;
    config.auth.token = TOKEN;
    resetLoginThrottle();
  });

  afterEach(() => {
    config.auth.token = savedToken;
    resetLoginThrottle();
  });

  describe('token and session primitives', () => {
    it('accepts only the exact owner token', () => {
      expect(isAuthEnabled()).toBeTrue();
      expect(isValidOwnerToken(TOKEN)).toBeTrue();
      expect(isValidOwnerToken(`${TOKEN}x`)).toBeFalse();
      expect(isValidOwnerToken('')).toBeFalse();
      expect(isValidOwnerToken(undefined)).toBeFalse();
    });

    it('validates signed session values and rejects tampered or expired ones', () => {
      const now = Date.now();
      const { value } = createSessionValue(now);
      expect(isValidSessionValue(value, now)).toBeTrue();

      const [exp, mac] = value.split('.');
      expect(isValidSessionValue(`${Number(exp) + 1000}.${mac}`, now)).toBeFalse();
      expect(isValidSessionValue(`${exp}.${'0'.repeat(mac.length)}`, now)).toBeFalse();
      expect(isValidSessionValue(value, Number(exp) + 1)).toBeFalse();
      expect(isValidSessionValue('garbage', now)).toBeFalse();
    });

    it('invalidates existing sessions when the token is rotated', () => {
      const { value } = createSessionValue();
      config.auth.token = 'a-completely-different-owner-token-value';
      expect(isValidSessionValue(value)).toBeFalse();
    });
  });

  describe('requireOwner middleware', () => {
    it('lets public routes through and blocks private ones without credentials', async () => {
      const app = buildApp();
      await request(app).get('/public').expect(200);
      const res = await request(app).get('/private').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('accepts a valid bearer token and rejects an invalid one', async () => {
      const app = buildApp();
      const ok = await request(app).get('/private').set('Authorization', `Bearer ${TOKEN}`).expect(200);
      expect(ok.body.method).toBe('bearer');
      await request(app).get('/private').set('Authorization', 'Bearer wrong').expect(401);
    });

    it('passes everything through when auth is disabled (no token configured)', async () => {
      config.auth.token = undefined;
      const app = buildApp();
      const res = await request(app).get('/private').expect(200);
      expect(res.body.method).toBe('disabled');
    });
  });

  describe('login flow', () => {
    it('issues an HttpOnly SameSite=Strict cookie that authenticates later requests', async () => {
      const app = buildApp();
      const login = await request(app).post('/api/v1/auth/login').send({ token: TOKEN }).expect(200);
      const setCookie = login.headers['set-cookie'].join(';');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');

      const cookie = cookieFrom(login);
      expect(cookie).toBeTruthy();
      const res = await request(app).get('/private').set('Cookie', cookie).expect(200);
      expect(res.body.method).toBe('cookie');

      const status = await request(app).get('/api/v1/auth/status').set('Cookie', cookie).expect(200);
      expect(status.body).toEqual(jasmine.objectContaining({ authEnabled: true, authenticated: true }));
    });

    it('rejects a wrong token with 401 and throttles after repeated failures', async () => {
      const app = buildApp();
      for (let i = 0; i < 10; i += 1) {
        await request(app).post('/api/v1/auth/login').send({ token: 'wrong' }).expect(401);
      }
      const throttled = await request(app).post('/api/v1/auth/login').send({ token: TOKEN }).expect(429);
      expect(throttled.body.code).toBe('LOGIN_THROTTLED');
    });

    it('rejects cookie-authenticated state changes from a foreign origin', async () => {
      const app = buildApp();
      const cookie = cookieFrom(await request(app).post('/api/v1/auth/login').send({ token: TOKEN }));
      const res = await request(app).post('/private').set('Cookie', cookie).set('Origin', 'https://evil.example').expect(403);
      expect(res.body.code).toBe('FORBIDDEN_ORIGIN');
      await request(app).post('/private').set('Cookie', cookie).set('Origin', config.server.frontendUrl).expect(200);
    });

    it('logout clears the cookie', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/v1/auth/logout').expect(200);
      expect(res.headers['set-cookie'].join(';')).toContain('Max-Age=0');
    });
  });
});
