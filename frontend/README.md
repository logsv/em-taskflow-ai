# 🎨 EM TaskFlow AI - Frontend Cockpit & Admin Portal

> **Modern React SPA Cockpit and Standalone Admin Portal built with Vite, `@assistant-ui/react`, space-dark glassmorphism styling, and custom Outfit typography.**

---

## 📑 Table of Contents
- [🎯 Overview & UI Capabilities](#-overview--ui-capabilities)
- [🧩 Key UI Features](#-key-ui-features)
- [⚙️ Standalone Admin Portal (`/admin`)](#️-standalone-admin-portal-admin)
- [🛠️ Development & Build Commands](#️-development--build-commands)
- [🔌 Backend API Integration & Proxying](#-backend-api-integration--proxying)
- [📁 Directory Structure](#-directory-structure)

---

## 🎯 Overview & UI Capabilities

The **EM TaskFlow AI Frontend** provides an interactive, space-dark cockpit for multi-agent chat interactions, PDF document ingestion, session management, and a dedicated **Standalone Admin Portal (`/admin`)**.

- **Framework**: React 18 + Vite
- **Chat Runtime**: `@assistant-ui/react` state management runtime
- **Design System**: Vanilla CSS tokens with glassmorphism, Outfit typography, and custom micro-animations
- **Routing**: Dual view navigation (`/` for Chat Cockpit, `/admin` for Standalone Admin Portal)

---

## 🧩 Key UI Features

### 1. Multi-Agent Chat Cockpit
- Powered by `@assistant-ui/react` for smooth streaming response rendering.
- Supports structured markdown blocks, executive summary cards, and source citations.
- Built-in `mode` switcher (`baseline` vs `advanced` multi-agent routing).

### 2. Collapsible PDF Upload Drawer
- Sidebar collapsible interface for uploading PDF documents to `/api/rag/upload`.
- Displays real-time ingestion status, chunk metrics, and document processing feedback.

### 3. Session & Thread Management
- Sidebar displaying active session metadata and chat thread history.
- Prominent **⚙️ Admin Portal ↗** footer link opening the standalone management hub in a new browser tab (`target="_blank"`).

### 4. Telemetry Feedback Controls
- Interactive thumbs up / thumbs down controls bound to `/api/feedback`.
- Non-blocking telemetry submission allowing continuous user interaction.

---

## ⚙️ Standalone Admin Portal (`/admin`)

The Standalone Admin Portal (`components/AdminPage.jsx`) provides a unified operational dashboard:

### 1. 🚀 Readymade External Service Hub
- **📊 Langfuse AI Telemetry** (`http://127.0.0.1:3001`): One-click launch to multi-agent execution traces, prompt cost metrics, and user feedback logs.
- **🔥 Arize Phoenix Tracing** (`http://127.0.0.1:6006`): Local OpenLLMetry LLM tracing, chunk retrieval spans, and evaluation traces.
- **🎯 Promptfoo Evaluation Matrix** (`http://127.0.0.1:15500`): Side-by-side prompt matrix comparison and automated red-teaming viewer.
- **⚖️ TruLens RAG Triad Leaderboard** (`http://127.0.0.1:8501`): RAG triad evaluation (groundedness, context relevance, answer relevance) dashboard.
- **🗄️ Adminer Postgres Explorer** (`http://127.0.0.1:8080`): Pre-configured database explorer for `taskflow_backend`, `taskflow_ai`, and `langfuse_db`.
- **⏳ Temporal Web UI** (`http://127.0.0.1:8233`): Durable workflow execution dashboard for RAG pipelines.

### 2. 🛠️ Native System Control Panels
- **📄 RAG Vector Store Management**: Document inventory table with single-click PDF chunk deletion and **PDF Chunk Inspector Modal** (`🔍 View`).
- **🔄 GitHub Sync & Cache**: Trigger manual GitHub repository issue synchronization and monitor cache freshness.
- **⚡ System Health & Ollama Status**: Real-time status indicators for local Ollama (`llama3.2`), Primary DB (5432), and Analytics DB (5433).
- **📈 EM DORA & Sprint Metrics**: Visual snapshot of Deployment Frequency, Lead Time, Failure Rate, MTTR, and Sprint Health.

---

## 🛠️ Development & Build Commands

### Prerequisites
Ensure Node.js 20+ is installed on your local machine.

### Run Development Server
```bash
cd frontend
npm install
npm run dev
```
Vite will launch the dev server at `http://localhost:3000`.

### Production Build
```bash
npm run build
```
Generates optimized production assets in the `dist/` folder.

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
│   ├── components/       # Chat cockpit, PDF drawer, Sidebar, AdminPage (Standalone Portal)
│   ├── hooks/            # Custom React hooks & assistant-ui runtime integration
│   ├── App.jsx           # Root layout & view router (/ and /admin)
│   ├── App.css           # Glassmorphism cockpit styling
│   └── index.jsx         # React entrypoint
├── public/               # Static assets & favicon
├── index.html            # Entry HTML document with SEO title & meta tags
├── vite.config.js        # Vite bundler & API proxy configuration
└── package.json          # Dependencies (@assistant-ui/react, lucide-react, vite)
```
