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

