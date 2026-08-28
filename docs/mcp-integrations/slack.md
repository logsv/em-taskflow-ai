# Slack Web API & Temporal HITL Governance

The **Slack MCP integration** enables EM TaskFlow AI agents to search past channel discussions, harvest team feedback for sprint retrospectives, corroborate Situation-Behavior-Impact (SBI) coaching notes, and post structured action summaries under strict **Temporal Human-in-the-Loop (HITL)** approval governance.

---

## 🛡️ Security & HITL Governance Architecture

To prevent autonomous agents from broadcasting unauthorized or unreviewed messages directly to engineering channels, EM TaskFlow AI enforces a strict boundary between **read** and **write** operations:

```
[ Domain Micro-Agents (Retro, SBI) / Chat UI / Admin ]
                      │
        ┌─────────────┴─────────────┐
        │                           │
  [ Read Queries ]            [ Post Queries ]
 (Search / List Channels)      (slack_post_message)
        │                           │
        ▼                           ▼
  [ Direct MCP Execution ]    [ Temporal HITL Workflow ] (slackPostHITLWorkflow)
  - slack_search_messages           │
  - slack_list_channels             ▼
                              [ PENDING_HUMAN_APPROVAL ]
                                    │
                         ┌──────────┴──────────┐
                         │ Human Decision      │
                         ▼                     ▼
                  [ Approve Signal ]     [ Reject Signal ]
                         │                     │
                         ▼                     ▼
            [ postSlackMessageActivity ]  [ Mark REJECTED ]
                         │                (No message sent)
                         ▼
             [ Live Post to Slack ]
```

1. **Direct Read Operations (Zero HITL Overhead)**:
   - `slack_search_messages` and `slack_list_channels` execute immediately against the Slack Web API, giving agents real-time context without blocking user interaction.
2. **Durable Human-in-the-Loop Post Workflow**:
   - `slack_post_message` intercepts agent post requests where `approved_by_human: false` (default for agent invocations).
   - Starts `slackPostHITLWorkflow` in Temporal and immediately returns a `PENDING_HUMAN_APPROVAL` status with the generated `workflowId` and draft summary.
   - Holds state durably in Temporal until an Engineering Manager reviews and approves the draft via the Admin Portal or REST API.

---

## 🛠️ Step-by-Step Configuration Guide

### 1. Create a Slack App
1. Go to [Slack API: Your Apps](https://api.slack.com/apps).
2. Click **Create New App** $\rightarrow$ **From scratch**.
3. Name it `EM TaskFlow AI` and select your development workspace.

### 2. Configure Bot Token Scopes
Under **Features** $\rightarrow$ **OAuth & Permissions**, scroll to **Scopes** $\rightarrow$ **Bot Token Scopes** and add:
- `channels:read` (View public channels)
- `channels:history` (View messages in public channels)
- `groups:history` (View messages in private channels the bot is invited to)
- `chat:write` (Send messages as the bot)
- `search:read` (Search workspace messages)

### 3. Install App to Workspace
1. Click **Install to Workspace** and click **Allow**.
2. Copy the **Bot User OAuth Token** (`xoxb-...`).

### 4. Configure Backend Environment
Add the credentials to [`backend/.env`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/.env):
```bash
SLACK_BOT_TOKEN=xoxb-your_bot_token
SLACK_DEFAULT_CHANNEL=#engineering-retro
MCP_SLACK_ENABLED=true
```

You can also configure or test credentials dynamically via the **⚙️ Standalone Admin Portal** at `http://localhost:3000/admin`.

---

## 🔧 Available Slack Tools

| Tool Name | Operation Type | HITL Required | Description |
| :--- | :--- | :---: | :--- |
| **`slack_search_messages`** | Read | ❌ No | Searches workspace messages and channel history by keyword query or channel topic. |
| **`slack_list_channels`** | Read | ❌ No | Lists public and private channels accessible to the EM TaskFlow AI bot. |
| **`slack_post_message`** | Write | ✅ Yes | Initiates a draft post governed by Temporal HITL approval before dispatching. |

---

## ⏳ Temporal Human-in-the-Loop (HITL) Workflow Details

### 1. Workflow Definition (`slackPostHITLWorkflow`)
Defined in [`backend/src/temporal/workflows.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/src/temporal/workflows.js):
- **Signals**:
  - `approveSlackPostSignal`: Delivers approval signal along with reviewer identity.
  - `rejectSlackPostSignal`: Delivers rejection signal and reason.
- **Timeout**: Enforces a configurable SLA (default 24h) before timing out unreviewed drafts.
- **Activity Execution**: Triggers `postSlackMessageActivity` only after receiving a confirmed approval signal.

### 2. Activity Execution (`postSlackMessageActivity`)
Defined in [`backend/src/temporal/activities.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/src/temporal/activities.js):
- Reads active Slack bot token from dynamic `settingsService` or environment.
- Executes `chat.postMessage` via Slack Web API.
- Falls back to simulated post logs if credentials are unconfigured in test environments.

---

## 📡 REST Management APIs for Slack HITL

The backend exposes administrative endpoints under `/api/admin/temporal/slack-post/*` in [`backend/src/routes/admin.js`](file:///Users/logsv/Documents/agent-dev/em-taskflow-ai/backend/src/routes/admin.js):

### 1. Initiate Draft Slack Post
```bash
POST /api/admin/temporal/slack-post/request
Content-Type: application/json

{
  "channel": "#engineering-retro",
  "message": "Sprint 42 Retrospective Action Items: 1. Optimize CI build caching. 2. Implement HITL approval gates.",
  "approver": "Sarah Chen",
  "sprintName": "Sprint 42"
}
```

**Response**:
```json
{
  "success": true,
  "status": "PENDING_HUMAN_APPROVAL",
  "workflowId": "slack-post-hitl-1718892000000",
  "channel": "#engineering-retro",
  "message": "Slack post held in Temporal HITL queue. Awaiting human confirmation."
}
```

### 2. Approve Draft Post
```bash
POST /api/admin/temporal/slack-post/approve
Content-Type: application/json

{
  "workflowId": "slack-post-hitl-1718892000000",
  "approver": "Sarah Chen"
}
```

### 3. Reject Draft Post
```bash
POST /api/admin/temporal/slack-post/reject
Content-Type: application/json

{
  "workflowId": "slack-post-hitl-1718892000000",
  "reason": "Needs re-formatting of action items"
}
```

### 4. Query Workflow Status
```bash
GET /api/admin/temporal/slack-post/status?workflowId=slack-post-hitl-1718892000000
```

---

## 🤖 Micro-Agent Integrations

### 1. Sprint Retrospective Specialist (`retroAgent`)
- Automatically queries `#engineering-retro` using `slack_search_messages`.
- Ingests card themes into *What Went Well* and *Areas for Improvement*.
- When asked to post results back to Slack, calls `slack_post_message` and presents the user with the generated `workflowId` for human approval.

### 2. Situation-Behavior-Impact Feedback Specialist (`sbiAgent`)
- Queries Slack discussions to extract verbatim communication context for constructive 1-on-1 coaching dossiers.
- Cites Slack timestamps and channels in `Corroborating Workspace Artifacts`.

---

## 📋 Autonomous EM Audit & Action Hub Slack Dispatch

In addition to micro-agent queries, the platform includes a **Multi-Channel Slack Dispatch Engine** wired to the **Autonomous EM Audit Engine** and **EM Action Hub UI** (`/actions`):

### 1. Whole-Audit Executive Briefing
- **Consolidated Executive Brief (`mode: 'consolidated'`)**: Dispatches a single rich scorecard with the Engineering Health Score (`🟢 92/100`), DORA tier, sprint pacing, overdue 1-on-1 count, and top 4 action items with deep links to the EM Action Hub.
- **Threaded Breakdown (`mode: 'threaded_subsections'`)**: Dispatches the scorecard as a parent message, followed by 4 sub-thread replies breaking down *Delivery & DORA*, *People & 1-on-1s*, *Sprint & OKRs*, and *SOP & Governance*.

### 2. Targeted Engineer Action Item Nudges
- 1-click **"💬 Nudge"** on any action item card formats and sends a direct Slack reminder to the assigned engineer (`@alex-dev`, `@sarah-c`) with context, PR/Jira deep link, and recommended next action.

### 3. Channel Resolution API
- Exposes `GET /api/v1/actions/slack/channels` to dynamically list available channels for the EM dispatch modal dropdown.

