# EM TaskFlow Frontend

React application with state runtime integration powered by `@assistant-ui/react` and built with Vite.

Current UI scope:
- Chat view cockpit with modern bubble styling (queries `POST /api/chat`)
- Collapsible PDF Drawer view (uploads to `POST /api/rag/upload`)
- Telemetry feedback buttons (thumbs up/down) bound to `POST /api/feedback`
- Sidebar with active session and thread metadata display

## How to Run

### Via Docker (Recommended)
From the project root directory, run:
```bash
docker compose up -d --build
```
The app will be available at `http://localhost:3000`.

### Locally (Development Mode)
```bash
cd frontend
npm install
npm start
```
Vite dev server will start on port `3000` and proxy API calls to the backend on `127.0.0.1:4000` as configured in `vite.config.js`.

## Build

```bash
npm run build
```
Production assets are generated in the `dist/` directory.

## Tests

```bash
npm test
```

## Notes

- PWA/service worker scaffolding is removed for simpler production behavior.
- Style system uses a premium integrated space-dark theme with Outfit typography.
