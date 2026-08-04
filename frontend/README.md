# 🎨 EM TaskFlow AI - Frontend Cockpit

> **Modern React SPA Cockpit built with Vite, `@assistant-ui/react`, space-dark glassmorphism styling, and custom Outfit typography.**

---

## 📑 Table of Contents
- [🎯 Overview & UI Capabilities](#-overview--ui-capabilities)
- [🧩 Key UI Features](#-key-ui-features)
- [🛠️ Development & Build Commands](#️-development--build-commands)
- [🔌 Backend API Integration & Proxying](#-backend-api-integration--proxying)
- [📁 Directory Structure](#-directory-structure)

---

## 🎯 Overview & UI Capabilities

The **EM TaskFlow AI Frontend** provides an interactive, space-dark cockpit for multi-agent chat interactions, PDF document ingestion, session management, and telemetry feedback.

- **Framework**: React 18 + Vite
- **Chat Runtime**: `@assistant-ui/react` state management runtime
- **Design System**: Vanilla CSS tokens with glassmorphism, Outfit typography, and custom micro-animations
- **Tooling**: Lucide icons, Vite proxy configuration for local development

---

## 🧩 Key UI Features

### 1. Multi-Agent Chat Cockpit
- Powered by `@assistant-ui/react` for smooth streaming response rendering.
- Supports structured markdown blocks, executive summary cards, and source citations.
- Built-in `mode` switcher (`baseline` vs `advanced` multi-agent routing).

### 2. Collapsible PDF Upload Drawer
- Sliding drawer interface for uploading PDF documents to `/api/rag/upload`.
- Displays real-time ingestion status, chunk metrics, and document processing feedback.

### 3. Session & Thread Management
- Sidebar displaying active session metadata and chat thread history.
- Cookie/header session initialization synced with `/api/session`.

### 4. Telemetry Feedback Buttons
- Interactive thumbs up / thumbs down controls bound to `/api/feedback`.
- Non-blocking telemetry submission allowing continuous user interaction.

---

## 🛠️ Development & Build Commands

### Prerequisites
Ensure Node.js 20+ is installed on your local machine.

### Run Development Server
```bash
cd frontend
npm install
npm dev # or npm start
```
Vite will launch the dev server at `http://localhost:3000`.

### Production Build
```bash
npm run build
```
Generates optimized production assets in the `dist/` folder.

### Run Frontend Tests
```bash
npm test
```

---

## 🔌 Backend API Integration & Proxying

During local development, Vite proxies API calls starting with `/api` to the backend Node.js server running at `http://127.0.0.1:4000`.

Configuration in [`vite.config.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/frontend/vite.config.js):

```javascript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:4000',
      changeOrigin: true,
    },
  },
}
```

---

## 📁 Directory Structure

```
frontend/
├── src/
│   ├── components/       # Chat cockpit, PDF drawer, sidebar, feedback buttons
│   ├── hooks/            # Custom React hooks & assistant-ui runtime integration
│   ├── styles/           # Theme tokens, Outfit font imports, glassmorphism utilities
│   ├── App.jsx           # Root UI layout & sidebar drawer state
│   └── main.jsx          # React entrypoint
├── public/               # Static assets & favicon
├── index.html            # Entry HTML document with SEO title & meta tags
├── vite.config.js        # Vite bundler & API proxy configuration
└── package.json          # Dependencies (@assistant-ui/react, lucide-react, vite)
```
