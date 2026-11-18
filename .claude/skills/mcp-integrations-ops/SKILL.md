---
name: mcp-integrations-ops
description: Use when touching backend/src/mcp/ or backend/src/integrations/ — Jira OAuth PKCE, Notion, GitHub PAT/OAuth and GitHub issue sync, Slack (incl. Temporal HITL posting), Google Calendar, integration client facades, credential handling in app_settings, or PostgreSQL fallbacks when a live integration fails. For adding a brand-new tool, use the add-mcp-tool skill.
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
| **Slack** | Bot Token / Web API | `slack_list_channels`, `slack_search_messages`, `slack_post_message` (Temporal HITL Governed) | Simulated post / empty list fallback |
| **Google Calendar** | OAuth 2.0 / API Key | `get_calendar_events`, `calendar_list_events`, `calendar_create_event` | Mock schedule / empty calendar fallback |

### 2. Temporal Human-in-the-Loop (HITL) Governance for Slack Posts
Slack operations follow a strict read/post security boundary:
- **Read Operations (`slack_search_messages`, `slack_list_channels`)**: Execute directly with zero HITL overhead.
- **Post Operations (`slack_post_message`)**: Automatically trigger a durable Temporal workflow (`slackPostHITLWorkflow`) entering `PENDING_HUMAN_APPROVAL`.
- **Human Approval & Rejection Signals**: The workflow awaits `approveSlackPost` or `rejectSlackPost` signals before dispatching `postSlackMessageActivity` to the Slack channel.

### 3. Standardized Integration Client Facades (`backend/src/integrations/clients/`)
All third-party HTTP communication is strictly encapsulated inside GoF Facade clients inheriting from `BaseIntegrationClient`:
- **`BaseIntegrationClient.js`**: Standardized HTTP handling, request/response timing, structured logging, and error normalization.
- **`GitHubClient.js`**, **`JiraClient.js`**, **`NotionClient.js`**, **`GoogleCalendarClient.js`**, **`SlackClient.js`**: Dedicated client implementations for API queries and live credential connection tests (`testConnection()`).
- **Zero Raw Axios in Tools or Settings**: `settingsService.js` and MCP tool adapters MUST NOT instantiate inline Axios requests or duplicate header/query construction; they must delegate directly to the respective client facade.

### 4. Resilience layers (where each concern actually lives)
- **HTTP timeouts / circuit breaking / error normalisation**: `BaseIntegrationClient.js` (all client facades inherit it).
- **Agent-level deterministic harness**: `createDeterministicToolHarness()` in `backend/src/mcp/baseToolHarness.js` — feature-flag gate, parallel multi-source execution (`mcpExecutors` → `directApiExecutors` → `dbCacheFallback`), Zod schema, non-blocking Langfuse span, then `computeMath`.
- **Per-call safety timeout for agents**: `safeExecuteMCPTool(toolName, params, timeoutMs = 2500)` in `backend/src/agent/baseAgent.js`.
- **Read-only result cache**: `backend/src/cache/toolCache.js` (TTL chosen by tool-name substring in `getDefaultTtlSeconds`).

### 5. Dual-Layer PostgreSQL Resiliency
When live third-party services are offline or rate-limited:
- The tool harness intercepts failures and queries PostgreSQL tables (`github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`).
- If PostgreSQL is temporarily unreachable, memory stores (`inMemoryGithubIssues`) provide a fail-safe fallback.

### 6. Direct API URL Resolution & Zero Broken Links Standard (`backend/src/utils/urlHelper.js`)
All tools and agents standardize link generation using `urlHelper.js`:
- **Direct URLs**: Always prefer native `html_url` or `url` directly from the provider REST API.
- **Configured Base URLs**: Construct issue/ticket links only when `JIRA_BASE_URL` or repository paths are validly configured in `app_settings`.
- **Zero Broken Links / No Fake Domains**: If an integration is unconfigured or a URL cannot be verified, tools MUST format as plain monospace code (e.g. `` `ENG-104` `` or `` `#42` ``) via `formatMarkdownLinkOrCode()`. Never output fake domains (`jira.atlassian.net`, `company/repo`) or dead anchor links (`#`).

### 7. 🔒 Database Key & Credential Preservation Standard
- **Never Purge Keys in `app_settings`**: Under no circumstances should test runs, database syncs, or schema migrations clear or truncate `app_settings`.
- **Masked Token Retainment**: When settings are saved from the UI or API, existing tokens (`JIRA_API_TOKEN`, `GITHUB_TOKEN`, `NOTION_API_KEY`, `SLACK_BOT_TOKEN`, `GOOGLE_CALENDAR_API_KEY`) must be preserved if masked (`******`) values are submitted.
- **Fail Loudly with Accurate Codes**: Live credential verification tests must fail loudly with exact HTTP error codes (e.g. 401 Unauthorized for expired/invalid tokens) rather than silently returning mock success.
- **Zero Silent Exception Swallowing**: Never use empty catch blocks (`catch (_e) {}`). Always log warnings with structured context using Pino.

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
node -e "import('./src/mcp/slack.js').then(async (m) => { const tools = await m.getSlackTools(); console.log('Slack Tool Count:', tools.length); });"

# Test Google Calendar Tool Harness
node -e "import('./src/mcp/google.js').then(async (m) => { const tools = m.createNativeGoogleCalendarTools(); console.log('Google Calendar Tool:', tools[0].name); });"
```

### 2. Verify Base Tool Harness & Slack HITL Specs
```bash
cd backend
npx jasmine --config=jasmine.json test/mcp/baseToolHarness.spec.js test/mcp/slack.spec.js test/temporal/slackHITL.spec.js test/services/mcpResiliency.spec.js
```

### 3. Test Jira OAuth Status API
```bash
curl -s http://localhost:4000/api/v1/mcp/jira/oauth/status
```

### 4. GitHub sync + cached-issue fallback
- `POST /api/v1/github/sync` (`backend/src/routes/v1/chat.js` → `githubSyncService.syncGithubData`) pulls open PRs/issues with the repo-scoped `GITHUB_TOKEN` and upserts into `github_issues` (`databaseService.upsertGithubIssues`).
- `databaseService.getGithubIssues({ repo, state, search })` serves the fallback; it degrades to `inMemoryGithubIssues` if PostgreSQL is down.
```bash
curl -s -X POST http://localhost:4000/api/v1/github/sync -H "Content-Type: application/json" -d '{}'
```

Finish with the `/verify` skill.
