---
name: mcp-integrations-ops
description: Operational procedures for managing, authenticating, and testing Model Context Protocol (MCP) integrations including Jira OAuth 2.0 PKCE, Notion REST API, GitHub PAT/OAuth scoping, Slack Web API, Google Calendar, and the Base Tool Harness circuit breaker.
---

# MCP Integrations & Tool Harness Operations Skill

Use this skill when implementing, extending, testing, or troubleshooting external Model Context Protocol (MCP) tool integrations, OAuth authentication flows, circuit breakers, and PostgreSQL dual-layer caching in EM TaskFlow AI.

---

## 📌 Architecture & Supported Integrations

### 1. Supported MCP Services (`backend/src/mcp/`)

| Service | Protocol / Auth | Tool Definitions | Fallback Store |
| :--- | :--- | :--- | :--- |
| **Atlassian Jira** | OAuth 2.0 PKCE / API Token | `jira_search`, `jira_get_issue`, `jira_create_issue` | `taskflow_backend` (`github_issues` / sprint snapshots) |
| **Notion** | OAuth 2.0 / Internal Integration Token | `notion_search`, `notion_get_page`, `notion_query_database` | `taskflow_backend` (cached docs & policies) |
| **GitHub** | OAuth 2.0 / Scoped PAT (`repo` scope) | `search_issues`, `list_pull_requests`, `get_dora_events` | `taskflow_backend` (`github_issues`) |
| **Slack** | Bot Token / Web API | `slack_list_channels`, `slack_search_messages`, `slack_post_message` | Domain-neutral empty list fallback |
| **Google Calendar** | OAuth 2.0 / API Key | `get_calendar_events`, `calendar_list_events`, `calendar_create_event` | Mock schedule / empty calendar fallback |

### 2. Standardized Base Tool Harness (`backend/src/mcp/baseToolHarness.js`)
All native MCP tools extend `BaseToolHarness` which provides:
- **Circuit Breaker**: Detects repeated upstream timeouts or 5xx failures and trips after threshold, preventing cascading request latency.
- **Exponential Backoff & Retries**: Automatically retries transient network errors.
- **Structured Telemetry**: Emits non-blocking execution duration and status events.
- **Schema Validation**: Zod parameter checking before tool invocation.

### 3. Dual-Layer PostgreSQL Resiliency
When live third-party services are offline or rate-limited:
- The tool harness intercepts failures and queries PostgreSQL tables (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`).
- If PostgreSQL is temporarily unreachable, memory stores (`inMemoryGithubIssues`) provide a fail-safe fallback.

---

## 🧪 Operational & Verification Commands

### 1. Test Native MCP Tools Execution via Node CLI
```bash
cd backend
# Test Jira JQL Search Harness
node -e "import('./src/mcp/jira.js').then(async (m) => { const tools = m.createNativeJiraTools(); console.log('Jira Search Tool:', tools[0].name); });"

# Test Notion Search Tool Harness
node -e "import('./src/mcp/notion.js').then(async (m) => { const tools = m.createNativeNotionTools(); console.log('Notion Search Tool:', tools[0].name); });"

# Test Slack MCP Tool Harness
node -e "import('./src/mcp/slack.js').then(async (m) => { const tools = m.createNativeSlackTools(); console.log('Slack Tool Count:', tools.length); });"

# Test Google Calendar Tool Harness
node -e "import('./src/mcp/google.js').then(async (m) => { const tools = m.createNativeGoogleCalendarTools(); console.log('Google Calendar Tool:', tools[0].name); });"
```

### 2. Verify Base Tool Harness Unit Specs
```bash
cd backend
npx jasmine test/mcp/baseToolHarness.spec.js test/services/mcpResiliency.spec.js
```

### 3. Test Jira OAuth Status API
```bash
curl -s http://localhost:4000/api/oauth/jira/status
```

### 4. Run Full Backend Test Suite (233 Specs)
```bash
cd backend
npm test
```
