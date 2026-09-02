# 🎯 Autonomous Action Item Formulation & Creation

EM TaskFlow AI provides an autonomous **Action Item Formulation & Creation Engine** that converts disparate signals from GitHub PRs, Jira blocker tickets, Google Calendar 1-on-1s, Notion OKRs, and copilot chat conversations into tracked, stateful records in PostgreSQL.

---

## 🏗️ Architecture & Action Lifecycle

```mermaid
flowchart TD
    subgraph SignalSources ["1. Multi-Source Diagnostic Signals"]
        S1["GitHub: PR review wait times >24h / >36h"]
        S2["Jira: Sprint tickets blocked >3 days"]
        S3["Google Calendar: Overdue 1-on-1s (>14d / >20d SLA)"]
        S4["Notion: Quarterly OKR pacing <60%"]
        S5["Chat: Manager commitments & blocker discussions"]
    end

    subgraph ActionCreators ["2. Autonomous Action Generation Channels"]
        A1["Temporal 4-Hour Audit Synthesis<br/>(synthesizeAuditAndActionItemsActivity)"]
        A2["Critic & Dossier Review Agent<br/>(auditReportTool in criticAgent.js)"]
        A3["In-Chat Decision Action Pills<br/>([🎯 Formulate Action Items])"]
    end

    S1 --> A1
    S2 --> A1
    S3 --> A1
    S4 --> A1
    S5 --> A3

    subgraph Deduplication ["3. Deterministic Deduplication & Scoring"]
        DEDUP["Deterministic Action ID Generator<br/>• act_pr_{id}<br/>• act_jira_{key}<br/>• act_1on1_{member}<br/>• act_okr_{target}<br/>Assigns Severity: CRITICAL | WARNING | INFO<br/>Computes Health Score penalty (-10 / -5 pts)"]
    end

    A1 --> DEDUP
    A2 --> DEDUP
    A3 --> DEDUP

    subgraph Persistence ["4. PostgreSQL Database (taskflow_backend)"]
        DB[("🐘 em_action_items<br/>• status: PENDING / IN_PROGRESS / COMPLETED<br/>• suggestedAction, assigneeName, resolutionNotes")]
    end

    DEDUP --> DB

    subgraph Triage ["5. Interactive Action Hub (/actions) & Slack"]
        HUB["EM Action Hub Cockpit<br/>• Needs Attention morning strip<br/>• Kanban Board & Linear-style Dense Table<br/>• 1-Click Slack Reminders & Nudges"]
    end

    DB --> HUB
```

---

## 🔍 The 3 Action Creation Channels

### 1. Autonomous Background Audit Synthesis (`synthesizeAuditAndActionItemsActivity`)
Executed automatically on the 4-hour Temporal cron (`0 */4 * * *`) or on-demand via UI:
- **Delivery Bottlenecks**: Scans open PRs. Stalled PRs waiting $>24\text{h}$ generate `WARNING` items; $>36\text{h}$ generate `CRITICAL` items.
- **Jira Impediments**: Identifies sprint tickets blocked $>3\text{ days}$, routing them as delivery blocker items.
- **People & 1-on-1 Cadences**: Computes days elapsed since the last 1-on-1. Syncs overdue $>14\text{ days}$ generate `WARNING` items; $>20\text{ days}$ generate `CRITICAL` items.
- **Quarterly OKR Targets**: Flags at-risk key results pacing $<60\%$ against target deadlines.

### 2. In-Chat Action Formulation (`[🎯 Formulate Action Items]`)
During conversational sessions with the EM Copilot:
- The assistant identifies implicit blockers, review delays, or team growth action points.
- Renders an interactive **`[🎯 Formulate Action Items]`** decision action pill inline.
- Clicking the pill automatically parses the conversational context into structured items in `em_action_items` without manual data entry.

### 3. Critic & Report Audit Agent (`criticAgent.js` / `auditReportTool`)
- Evaluates draft weekly status reports, performance dossiers, and promotion nomination packets.
- Flags unquantified business claims, missing peer feedback, or unmitigated risks.
- Autonomously produces a structured **Remediation Action Checklist** for the manager.

---

## 🏷️ Deterministic Action Item IDs

To prevent duplicate records across recurring 4-hour cron runs:
- Pull requests: `act_pr_{prNumber}` (e.g. `act_pr_89`)
- Jira tickets: `act_jira_{issueKey}` (e.g. `act_jira_ENG_1024`)
- 1-on-1 meetings: `act_1on1_{memberEmailOrName}` (e.g. `act_1on1_sarah_chen`)
- Key results: `act_okr_{targetSlug}` (e.g. `act_okr_deploy_frequency`)

Existing items in `em_action_items` retain their current status (`IN_PROGRESS`, `COMPLETED`, `DISMISSED`) and resolution notes during subsequent audit runs.
