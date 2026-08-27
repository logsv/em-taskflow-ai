import {
  buildLegacyEndpointDisabledPayload,
  createLegacyEndpointGate,
} from '../../src/routes/legacyRouteGate.js';

describe('legacyRouteGate', () => {
  it('builds a consistent deprecation payload', () => {
    expect(buildLegacyEndpointDisabledPayload({
      replacement: '/api/chat',
      requestId: 'req_123',
    })).toEqual({
      error: 'This legacy endpoint has been deprecated',
      replacement: '/api/chat',
      requestId: 'req_123',
    });
  });

  it('passes through when the legacy endpoint is enabled', () => {
    const next = jasmine.createSpy('next');
    const res = {
      status: jasmine.createSpy('status'),
      json: jasmine.createSpy('json'),
    };

    const gate = createLegacyEndpointGate({
      enabled: true,
      replacement: '/api/chat',
    });

    gate({ requestId: 'req_123' }, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 410 when the legacy endpoint is disabled', () => {
    const next = jasmine.createSpy('next');
    const res = {
      status: jasmine.createSpy('status').and.returnValue({
        json: jasmine.createSpy('json'),
      }),
    };

    const gate = createLegacyEndpointGate({
      enabled: false,
      replacement: '/api/chat',
    });

    gate({ requestId: 'req_123' }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.status.calls.mostRecent().returnValue.json).toHaveBeenCalledWith({
      error: 'This legacy endpoint has been deprecated',
      replacement: '/api/chat',
      requestId: 'req_123',
    });
  });

  describe('attachLegacyDeprecationHeaders', () => {
    it('sets standard HTTP deprecation headers and calls next()', async () => {
      const { attachLegacyDeprecationHeaders } = await import('../../src/routes/legacyRouteGate.js');
      const headers = {};
      const req = { originalUrl: '/api/health' };
      const res = {
        setHeader: jasmine.createSpy('setHeader').and.callFake((key, val) => {
          headers[key] = val;
        }),
      };
      const next = jasmine.createSpy('next');

      attachLegacyDeprecationHeaders(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(headers['Deprecation']).toBe('true');
      expect(headers['Sunset']).toContain('2026');
      expect(headers['X-API-Version']).toBe('v1');
      expect(headers['Link']).toBe('</api/v1/health>; rel="successor-version"');
    });
  });
});


