# 📋 Interactive EM Action Hub (`/actions`)

The **EM Action Hub** serves as the central command cockpit for Engineering Managers to triage blockers, enforce review SLAs, review 1-on-1 cadences, and manage team actions.

---

## 📊 Executive Summary Strip

Mounted at the top of the Action Hub, the Executive Summary provides 4 high-impact decision metric cards:
1. **Needs Attention**: Total count of critical blockers and stalled workflows.
2. **Overdue SLAs**: Pull requests $>24\text{h}$, 1-on-1s $>14\text{d}$, and blocked Jira tickets $>3\text{d}$.
3. **Engineering Health Score**: Composite score ($20 \le \text{Score} \le 100$) with a slide-out Health Score Breakdown Drawer detailing all positive and negative penalty triggers.
4. **Autonomous Audit Status**: Live status of the 4-hour background cron with a 1-click **"🚀 Run Audit Now"** trigger button.

---

## 🚨 Morning "Needs Attention" Triage Strip

A dedicated high-urgency section spotlighting items requiring immediate morning attention:
- Visual SLA countdown badges (*"Waiting 38h (>24h SLA)"*).
- 1-Click Primary CTAs: **"⏳ In Progress"**, **"✅ Done"**, and **"💬 Nudge on Slack"**.

---

## 🗂️ Segmented Workspace: Kanban vs. Dense Table

Operators can toggle instantly between two visual triage paradigms:

### 1. Kanban Board Mode (`viewMode: 'kanban'`)
- 3 interactive swimlanes:
  - 🟡 **Pending Triage** (`column-pending`)
  - 🔵 **In Progress** (`column-in-progress`)
  - 🟢 **Resolved / Completed** (`column-completed`)
- Scannable action cards with severity pills (`CRITICAL`, `WARNING`, `INFO`), category badges, and external tool origin tags (GitHub, Jira, GCal, Notion).

### 2. Dense Table Mode (`viewMode: 'table'`)
- High-density Linear/Jira-style table optimized for rapid scanning.
- Multi-select checkboxes for batch triage.
- Floating **Bulk Action Bar** (`BulkActionBar.jsx`):
  - **"⏳ In Progress (N)"**
  - **"✅ Mark Done (N)"**
  - **"💬 Share Selected to Slack"**
  - **"🚫 Dismiss (N)"**
  - **"✕ Clear Selection"** (`Esc`)

---

## 🔍 Action Details Drawer (`ActionDetailsDrawer.jsx`)

Clicking any card or table row opens a slide-out drawer providing deep context:
- **Impact Rationale**: Clear explanation of why this item matters to team velocity.
- **Deterministic Diagnostic Signals**: Exact API metrics (e.g. `PR #89 waiting 36.4h`, `Deploy Frequency 0.2/day`).
- **Policy Rule Attribution**: Direct link to the governing SOP or ADR rule.
- **In-Drawer Resolution Logger**: Allows the manager to record resolution notes and mark completion with audit trails.

---

## 👥 Team 1-on-1 Cadence & People Pulse

A dedicated view tracking:
- Engineer name, email, and avatar.
- Current career level and next cycle target (`L4 Mid → L5 Senior`, `L5 Senior → M1 EM`).
- Tenure and days since last recorded 1-on-1 check-in.
- 1-Click Slack ping button to schedule overdue syncs.
