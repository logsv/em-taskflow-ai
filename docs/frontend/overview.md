# 💻 Frontend Architecture & UI Overview

EM TaskFlow AI provides a modern, responsive single-page application built with **React 18**, **Vite**, **`@assistant-ui/react`**, and a zero-dependency semantic CSS token design system.

---

## 🎯 Design Philosophy: Workflow-First Architecture

> **"Workflows are the product; agents are the implementation."**

Traditional AI chatbots clutter the user interface with model parameters, agent selectors, chunk sizes, and raw tool payloads. EM TaskFlow AI abstracts technical complexities into clean, decision-oriented cockpits:

```
[ EM TaskFlow AI Web App ]
      │
      ├── 1. Low-Distraction EM Copilot Chat Cockpit (/)
      │     ├── Clean GFM Markdown chat powered by @assistant-ui/react
      │     ├── Quick Actions Palette (⌘K) with rich domain workflow prompts
      │     ├── Decision Action Pills ([📋 Action Hub], [🎯 Formulate Actions])
      │     ├── Multi-Session Sidebar with pagination, context menus & inline rename
      │     └── Developer Diagnostics & Advanced Settings Modal
      │
      ├── 2. Interactive EM Action Hub (/actions)
      │     ├── Executive Summary Strip & Health Score Breakdown Drawer
      │     ├── High-urgency "Needs Attention" Morning Triage Strip with SLA countdowns
      │     ├── Segmented Workspace: Kanban Board vs Linear-style Dense Table
      │     ├── Floating Bulk Action Bar for batch triage
      │     ├── Action Details Drawer with deterministic diagnostic signal mapping
      │     └── Team 1-on-1 Cadence Tracking Matrix
      │
      └── 3. Standalone Operator Admin Portal (/admin)
            ├── Compact Header with Slide-out System Diagnostics Drawer
            ├── 5 Operator Domain Tabs: Overview, Team, Settings/Models, Services, Storage
            ├── Live Connection Test Harnesses (Ollama, Jira, GitHub, Notion, GCal, Slack)
            └── 8-Service Catalog Deep Links (Langfuse, Promptfoo, Adminer, Temporal)
```

---

## 🎨 Semantic CSS Token System (`tokens.css` & `adminTokens.css`)

The UI is built with a cohesive dark-themed semantic token system:

| CSS Variable | Purpose | Semantic Token Value |
| :--- | :--- | :--- |
| `--color-primary` | Primary accent & active highlights | `#38bdf8` (Sky Blue) |
| `--color-bg-canvas` | Main viewport background | `#0b0f19` (Deep Navy) |
| `--color-bg-card` | Surface level cards and containers | `#111827` (Charcoal Slate) |
| `--color-border-subtle` | Subtle structural dividers | `#1e293b` (Slate Border) |
| `--color-status-good` | Passing checks, Elite DORA, resolved items | `#10b981` (Emerald Green) |
| `--color-status-warn` | Overdue SLAs, approaching limits | `#f59e0b` (Amber Yellow) |
| `--color-status-danger` | Critical blockers, test breakages | `#ef4444` (Rose Red) |

---

## ⚡ Client Centralization (`apiClient.js`)

All API interactions flow through a centralized API client module [`frontend/src/services/apiClient.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/frontend/src/services/apiClient.js) that enforces canonical `/api/v1/*` route pathing and attaches session context headers transparently.
