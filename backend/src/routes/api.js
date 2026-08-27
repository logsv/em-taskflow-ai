import express from 'express';
import v1Router from './v1/index.js';
import { attachLegacyDeprecationHeaders } from './legacyRouteGate.js';

const router = express.Router();

// Attach standard HTTP deprecation headers (Sunset, Deprecation, Link) to legacy /api endpoints
router.use(attachLegacyDeprecationHeaders);

// Forward all legacy requests directly to canonical v1 router
router.use('/', v1Router);

export default router;

