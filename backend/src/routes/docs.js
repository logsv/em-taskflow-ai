import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const openapiPath = path.resolve(__dirname, '../docs/openapi.json');

let cachedOpenApiSpec = null;
function getOpenApiSpec() {
  if (!cachedOpenApiSpec && fs.existsSync(openapiPath)) {
    try {
      const raw = fs.readFileSync(openapiPath, 'utf8');
      cachedOpenApiSpec = JSON.parse(raw);
    } catch (e) {
      cachedOpenApiSpec = { openapi: '3.1.0', info: { title: 'EM TaskFlow AI API', version: '1.0.0' } };
    }
  }
  return cachedOpenApiSpec || {};
}

// Serve raw OpenAPI JSON specification
router.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(getOpenApiSpec());
});

// Serve Interactive Swagger UI Page
router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EM TaskFlow AI - Swagger API Explorer</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text y='20' font-size='20'>⚡</text></svg>">
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body {
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .swagger-ui .topbar { display: none; }
    .swagger-ui {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
      filter: invert(88%) hue-rotate(180deg);
    }
    .header-banner {
      background: #1e293b;
      padding: 16px 32px;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-links a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 0.9rem;
      margin-left: 16px;
      transition: color 0.2s;
    }
    .header-links a:hover { color: #38bdf8; }
  </style>
</head>
<body>
  <div class="header-banner">
    <div class="header-title">⚡ EM TaskFlow AI &bull; Interactive API Explorer</div>
    <div class="header-links">
      <a href="/api/health" target="_blank">Health Check</a>
      <a href="/api/docs/openapi.json" target="_blank">OpenAPI JSON</a>
      <a href="http://localhost:3000/admin" target="_blank">Admin Portal ↗</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
