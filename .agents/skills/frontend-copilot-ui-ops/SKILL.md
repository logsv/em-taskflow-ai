---
name: frontend-copilot-ui-ops
description: Operational procedures for managing, developing, and testing the EM TaskFlow AI Frontend UI/UX Copilot interface, CSS design tokens, Quick Actions (Cmd+K) intent search catalog, Decision Action Pills, Dev Settings Modal, and Vite production builds.
---

# 🎨 Frontend Copilot UI/UX Operations

This skill outlines operational procedures, architecture standards, design tokens, and verification workflows for the **EM TaskFlow AI** frontend interface.

---

## 🏛️ Core UX Principle

> **"Workflows are the product; agents are the implementation."**

The interface prioritizes workflow clarity, actionable management outcomes, and progressive disclosure over exposing backend implementation mechanics (such as sub-agent routing details, raw tool lists, or vector chunk parameters in the primary chat flow).

---

## 🎨 Global Design System & Token Standard (`frontend/src/index.css`)

All components MUST utilize the central CSS design tokens rather than hardcoded hex colors or arbitrary margins/paddings.

### 1. Palette & Surface Tokens
- **Canvas / Background**: `--bg-canvas` (`#0b0c10`)
- **Card / Bubble Surfaces**: `--bg-surface` (`#12131b`), `--bg-elevated` (`#181a24`), `--bg-subtle` (`#1d2030`)
- **Borders**: `--border-subtle` (`rgba(255, 255, 255, 0.08)`), `--border-medium` (`rgba(255, 255, 255, 0.14)`), `--border-active` (`#8b5cf6`)
- **Accent (Reserved for AI & Primary Actions)**:
  - `--accent-primary`: `#8b5cf6` (Purple 500)
  - `--accent-hover`: `#7c3aed` (Purple 600)
  - `--accent-surface`: `rgba(139, 92, 246, 0.12)`
  - `--accent-border`: `rgba(139, 92, 246, 0.28)`

### 2. Status Indicators
- **Success**: `--status-success` (`#34d399`), `--status-success-bg` (`rgba(52, 211, 153, 0.12)`)
- **Warning**: `--status-warning` (`#f59e0b`), `--status-warning-bg` (`rgba(245, 158, 11, 0.12)`)
- **Danger**: `--status-danger` (`#f87171`), `--status-danger-bg` (`rgba(248, 113, 113, 0.12)`)
- **Info**: `--status-info` (`#38bdf8`), `--status-info-bg` (`rgba(56, 189, 248, 0.12)`)

### 3. Typography & Spacing
- Scale: `--font-size-xs` (11px), `--font-size-sm` (13px), `--font-size-base` (14px), `--font-size-md` (16px), `--font-size-lg` (18px), `--font-size-xl` (22px), `--font-size-2xl` (28px).
- Radiuses: `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px), `--radius-full` (9999px).

---

## 🧭 Application Component Hierarchy & State Flow

```
[ App.jsx ] ── (Global keydown: Cmd+K / Ctrl+K)
   │
   ├── [ Sidebar.jsx ]
   │      ├── Brand + New Chat
   │      ├── WORKSPACE (Overview, Quick Actions [⌘K], Action Hub [badge])
   │      ├── RECENT (Paginated sessions list: rename, delete, archive)
   │      └── Footer: Settings & Tools (DevSettingsModal trigger)
   │
   ├── [ Chat.jsx ]
   │      ├── Quiet Header: GitHub Sync Status (● Synced / ↻ Syncing / Refresh) + Quick Actions
   │      │
   │      ├── Empty / Home State:
   │      │      ├── Hero: "Engineering Management Copilot"
   │      │      ├── Close-Coupled Input Composer
   │      │      ├── Category Filter Tabs (All, Delivery, People, Planning, Governance)
   │      │      ├── 2x2 Curated Starter Grid (DORA, PR Bottlenecks, SBI Prep, Sprint Pacing)
   │      │      └── Recent Work Grid (1-click resumption)
   │      │
   │      ├── Active Conversation State:
   │      │      ├── Message Bubbles (GFM Markdown tables, callouts, syntax code)
   │      │      ├── Decision Action Pills ([📋 Action Hub], [🎯 Formulate Actions])
   │      │      ├── Feedback Telemetry (👍 / 👎)
   │      │      └── Stale-Data Alert with 1-click refresh
   │      │
   │      └── Floating Bottom Composer (during active chat)
   │
   ├── [ ActionHubPage.jsx ] (EM Decision Cockpit /actions)
   │      ├── ActionHubHeader.jsx (Live sync pill, Run Audit CTA, Slack Dispatch)
   │      ├── ExecutiveSummary.jsx (4 metric cards + Health Score Breakdown Drawer)
   │      ├── NeedsAttentionSection.jsx (Top critical/warning risks with SLA countdown & 1-click CTA)
   │      ├── ActionWorkspaceControls.jsx (Always-visible Search + Filter Popover + View Switcher)
   │      ├── BulkActionBar.jsx (Floating multi-select toolbar: In Progress, Resolve, Slack, Dismiss)
   │      ├── ActionCard.jsx (Scannable card layout with severity dot, owner pill, recommendation box)
   │      ├── ActionDetailsDrawer.jsx (Slide-out diagnostic drawer with explainability rules & resolution notes)
   │      └── Tab Views: Kanban, Dense Table, SOP Checklist, Team Cadence Matrix, Sprint/DORA, Audit History
   │
   ├── [ AgentPromptPalette.jsx ] (Quick Actions Modal)
   │      ├── Search Input with Intent Keyword Matching
   │      ├── Category Filter Tabs
   │      ├── Cards with Direct `Run →` Trigger
   │      ├── Progressive Disclosure `⋯` Scenario Hints Drawer
   │      └── Keyboard Navigation (↑ / ↓ / Enter / Esc)
   │
   └── [ DevSettingsModal.jsx ] (Developer Diagnostics & Settings)
          ├── Advanced RAG Mode Toggle (HyDE + CTE RRF)
          ├── Active Session Diagnostics (Copy Session/Thread ID)
          ├── PostgreSQL Cache Metrics (GitHub issues count & refresh)
          └── External Service Portals (Langfuse, Temporal, Adminer, Admin Portal)
```

---

## ⚡ Quick Actions Workflow Catalog (`agentPrompts.js`)

All workflows in `frontend/src/constants/agentPrompts.js` MUST contain:
1. `id`: Unique identifier (e.g. `team-health-audit`, `dora-metrics`, `sbi-feedback`).
2. `title`: Outcome-oriented title.
3. `category`: Normalized category (`multi-agent`, `delivery`, `people`, `planning`, `governance`).
4. `description`: Brief 1-line description of the outcome.
5. `prompt`: Exact initial prompt sent to the LLM agent.
6. `keywords`: Array of search keywords for rich intent matching (e.g. `["multi-agent", "dora", "health", "audit"]`).
7. `scenarios`: Array of 2–3 specific scenarios/examples for progressive disclosure (`⋯` hints).

---

## 🧪 Build & Verification Commands

### 1. Frontend Production Compilation
```bash
cd frontend
npm run build
```
*Expected: Vite builds bundle cleanly with 0 errors (`dist/index.html`, `dist/assets/*`).*

### 2. Frontend Development Server
```bash
cd frontend
npm run dev
```
*Runs development server at `http://localhost:3000` with hot-module reload (HMR).*

### 3. Verify CSS Balance
```bash
node -e "
const fs = require('fs');
function scanDir(dir) {
  for (let e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = dir + '/' + e.name;
    if (e.isDirectory()) scanDir(full);
    else if (e.name.endsWith('.css')) {
      const code = fs.readFileSync(full, 'utf8');
      let open = 0;
      for (let ch of code) { if (ch === '{') open++; if (ch === '}') open--; }
      if (open !== 0) console.error('UNBALANCED CSS:', full, open);
    }
  }
}
scanDir('frontend/src');
console.log('CSS Scan complete');
"
```
