# MCP Integrations & Tool Harness Architecture

EM TaskFlow AI integrates with external developer platforms using the **Model Context Protocol (MCP)** and standardized REST tool harnesses.

---

## 🔌 Supported MCP Integrations

| Service | Protocol / Authentication | Tool Definitions | Fallback Store | HITL Governance |
| :--- | :--- | :--- | :--- | :---: |
| **Atlassian Jira** | OAuth 2.0 PKCE / API Token | `jira_search`, `jira_get_issue`, `jira_create_issue` | `taskflow_backend` (`github_issues` / sprint snapshots) | ❌ Direct |
| **Notion** | OAuth 2.0 / Internal Integration Token | `notion_search`, `notion_get_page`, `notion_query_database` | `taskflow_backend` (cached docs & policies) | ❌ Direct |
| **GitHub** | OAuth 2.0 / Scoped PAT (`repo` scope) | `search_issues`, `list_pull_requests`, `get_dora_events` | `taskflow_backend` (`github_issues`) | ❌ Direct |
| **Slack Web API** | Bot Token (`xoxb-...`) | `slack_list_channels`, `slack_search_messages`, `slack_post_message` | Simulated post / empty list fallback | ✅ Posts Governed via Temporal |
| **Google Calendar** | OAuth 2.0 / API Key | `get_calendar_events`, `calendar_list_events`, `calendar_create_event` | Mock schedule / empty calendar fallback | ❌ Direct |

---

## 🛡️ Base Tool Harness (`baseToolHarness.js`)

All external MCP integrations inherit from `BaseToolHarness`, which provides:

1. **Circuit Breaker Pattern**:
   - Detects repeated timeouts or upstream 5xx errors.
   - Trips open after consecutive failures to prevent cascading backend latency.
2. **Exponential Backoff & Retries**:
   - Automatically retries transient network hiccups with jittered backoff.
3. **Structured Telemetry & Latency Logging**:
   - Emits non-blocking execution duration metrics to the logger.
4. **Zod Schema Validation**:
   - Validates input arguments before triggering upstream HTTP requests.

---

## ⏳ Temporal Human-in-the-Loop (HITL) Post Governance

For communication channels such as **Slack**, write operations (`slack_post_message`) do not post directly to channels autonomously. Instead:
1. The tool harness dispatches `startSlackPostHITLWorkflow` via Temporal (`slackPostHITLWorkflow`).
2. The message is held in `PENDING_HUMAN_APPROVAL` status.
3. Once an authorized human signals approval via the Admin Portal or REST API, Temporal triggers `postSlackMessageActivity` to dispatch the verified message.

---

## 🗄️ Dual-Layer Database Resiliency

If an external service is offline, unconfigured, or rate-limited:
1. The tool harness catches the exception.
2. Queries the local PostgreSQL cache (`taskflow_backend` tables: `github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`).
3. If PostgreSQL is temporarily unreachable, in-memory caches provide a secondary fallback layer.
4. Returns real snapshot data with clear metadata provenance indicators.
