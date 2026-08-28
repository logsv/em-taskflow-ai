export function buildLegacyEndpointDisabledPayload({
  replacement,
  requestId,
}) {
  return {
    error: 'This legacy endpoint has been deprecated',
    replacement,
    requestId,
  };
}

export function createLegacyEndpointGate({
  enabled,
  replacement,
}) {
  return function legacyEndpointGate(req, res, next) {
    if (enabled) {
      return next();
    }

    return res.status(410).json(
      buildLegacyEndpointDisabledPayload({
        replacement,
        requestId: req.requestId,
      }),
    );
  };
}

/**
 * Middleware that sets standard HTTP deprecation headers on unversioned legacy /api endpoints.
 * Includes Deprecation, Sunset, Link (to successor /api/v1 endpoint), and X-API-Version headers.
 */
export function attachLegacyDeprecationHeaders(req, res, next) {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT');
  res.setHeader('X-API-Version', 'v1');
  const path = req.originalUrl || req.url || '';
  const successorPath = path.startsWith('/api/v1')
    ? path
    : path.replace(/^\/api(?!\/v1)/, '/api/v1');
  res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
  next();
}

