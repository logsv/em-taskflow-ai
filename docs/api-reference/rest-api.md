# REST API Reference (v1)

EM TaskFlow AI provides an interactive **Swagger API Explorer** mounted at `http://localhost:4000/api/v1/docs` and an OpenAPI 3.1 specification at `http://localhost:4000/api/v1/docs/openapi.json`.

---

## ⚡ Interactive Swagger UI

Open [`http://localhost:4000/api/v1/docs`](http://localhost:4000/api/v1/docs) in your browser to test endpoints interactively with custom parameters and sample payloads.

> [!NOTE]
> For backward compatibility, legacy requests to `/api/*` are transparently aliased and forwarded to `/api/v1/*`. Responses on unversioned `/api/*` endpoints include standard HTTP `Deprecation: true`, `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`, and `Link: </api/v1/...>; rel="successor-version"` headers.

---

## 📡 Endpoint Catalog (v1)

### System & Health
- **`GET /api/v1/health`**: Returns system health status, DB connectivity, and LLM readiness.
  - Response header includes `X-API-Version: v1`.

### Chat & Inference
- **`POST /api/v1/chat`**: Primary chat endpoint supporting multi-agent routing, baseline RAG, and file attachments.
  ```json
  {
    "message": "Calculate DORA metrics for repository backend",
    "threadId": "th_12345",
    "mode": "advanced"
  }
  ```

### Session & Thread Management
- **`GET /api/v1/sessions?page=1&limit=10`**: Returns paginated session list with active thread titles.
- **`POST /api/v1/sessions`**: Initializes a new chat session.
- **`GET /api/v1/session`**: Resolves current session context from cookies or headers.
- **`POST /api/v1/threads`**: Creates a new thread for the current session.
- **`POST /api/v1/sessions/:sessionId/switch`**: Switches active thread.
- **`GET /api/v1/threads/:threadId/messages`**: Retrieves message history.
- **`DELETE /api/v1/sessions/:sessionId`**: Deletes session.
- **`PATCH /api/v1/sessions/:sessionId/archive`**: Archives session.

### Engineering Management (EM) & Action Hub
- **`GET /api/v1/actions`**: Returns list of deduplicated action items with status, severity, category, assignee, and tool references.
- **`GET /api/v1/actions/summary`**: Aggregated health metrics, pending actions, and overall Engineering Health Score ($20 \le \text{Score} \le 100$).
- **`PATCH /api/v1/actions/:id`**: Updates action status (`IN_PROGRESS`, `COMPLETED`, `DISMISSED`) with resolution notes and resolver name.
- **`POST /api/v1/actions/batch`**: Bulk status transitions or multi-item operations.
- **`POST /api/v1/actions/audit/trigger`**: Triggers immediate on-demand autonomous audit harvest.
- **`POST /api/v1/actions/slack/dispatch`**: Dispatches executive briefing to Slack in Consolidated or Threaded format.
- **`POST /api/v1/actions/:id/nudge`**: Dispatches targeted Slack DM to assigned engineer with PR/Jira deep links.
- **`GET /api/v1/actions/sop/compliance`**: Returns live ADR-008 per-service DB isolation and SOP compliance checklist.
- **`GET /api/v1/em/dora`**: Returns DORA 4 metrics with tier ratings (*Elite*, *High*, *Medium*, *Low*).
- **`GET /api/v1/em/sprints`**: Returns sprint velocity, committed vs completed story points, and WIP limits.
- **`GET /api/v1/em/okrs`**: Returns quarterly OKR progress and pacing scores.
- **`GET /api/v1/em/sbi`**: Returns structured SBI feedback records.

### Document Ingestion & Vector Storage
- **`POST /api/v1/rag/upload`**: Multipart file upload (PDF, CSV, TXT, PNG/JPG) processed via Temporal.
- **`GET /api/v1/admin/documents`**: Lists all ingested documents and chunk counts.
- **`GET /api/v1/admin/documents/:filename/chunks`**: Retrieves extracted text chunks for inspector modal.
- **`DELETE /api/v1/admin/documents/:filename`**: Deletes document and purges vector embeddings.

### Administration & Team Directory
- **`GET /api/v1/admin/system-status`**: Aggregated system diagnostics across 10 micro-agents, DBs, and Ollama.
- **`GET /api/v1/admin/team`**: Synced team members with cross-platform identity mapping.
- **`POST /api/v1/admin/team/sync`**: Triggers background team identity synchronization from GitHub, Jira, and Notion.
- **`GET /api/v1/admin/settings`**: Current application and LLM/MCP configurations.
- **`PUT /api/v1/admin/settings`**: Updates and hot-reloads runtime settings.

### Atlassian Jira OAuth 2.0 PKCE
- **`GET /api/v1/mcp/jira/oauth/start`**: Initiates 3LO PKCE authorization.
- **`GET /api/v1/mcp/jira/oauth/callback`**: Atlassian OAuth redirect callback endpoint.
- **`GET /api/v1/mcp/jira/oauth/status`**: Current OAuth connection state and token expiry.
- **`POST /api/v1/mcp/jira/oauth/disconnect`**: Revokes tokens and disconnects OAuth.

### Telemetry & Feedback
- **`POST /api/v1/feedback`**: Submits non-blocking thumbs up / down ratings to Langfuse telemetry.

