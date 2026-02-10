# EM TaskFlow Frontend

React frontend for the simplified EM TaskFlow runtime.

Current UI scope:
- Chat view (queries `POST /api/rag/query`)
- PDF upload view (uploads to `POST /api/upload-pdf`)
- Sidebar-based navigation

## Setup

```bash
cd frontend
npm install
npm start
```

The frontend proxies API requests to backend on `http://localhost:4000` via `package.json`.

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

Useful targeted tests:
```bash
npm test -- --watchAll=false src/components/Chat.test.js src/App.test.js
```

## Notes

- PWA/service worker scaffolding is removed for simpler production behavior.
- Unused legacy components were pruned to keep the UI aligned with the active backend API.
