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
- **`POST /api/v1/chat`**: Primary chat endpoint supporting multi-agent routing, baseline/advanced RAG, and file attachments.
- **`POST /api/v1/chat/upload`**: Multipart file upload for chat attachment summarization.

### Session & Thread Management
- **`GET /api/v1/sessions?page=1&limit=10`**: Returns paginated session list with active thread titles.
- **`POST /api/v1/sessions`**: Initializes a new chat session.
- **`GET /api/v1/session`**: Resolves current session context from cookies or headers.
- **`POST /api/v1/threads`**: Creates a new thread for the current session.
- **`POST /api/v1/sessions/:sessionId/switch`**: Switches active thread.
- **`GET /api/v1/threads/:threadId/messages`**: Retrieves message history with citations and trace metadata.
- **`DELETE /api/v1/sessions/:sessionId`**: Deletes session and associated messages.
- **`PATCH /api/v1/sessions/:sessionId/archive`**: Archives session.

### Engineering Management (EM) & Action Hub
- **`GET /api/v1/actions`**: Lists action items filtered by `status`, `category`, and `severity`.
- **`GET /api/v1/actions/summary`**: Aggregated health metrics, pending actions, and overall Engineering Health Score ($20 \le \text{Score} \le 100$).
- **`PATCH /api/v1/actions/:id`**: Updates action status (`IN_PROGRESS`, `COMPLETED`, `DISMISSED`) with resolution notes and resolver name.
- **`POST /api/v1/actions/batch`**: Bulk status transitions and multi-item operations.
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

### Administration, Cache & Team Directory
- **`GET /api/v1/admin/system-status`**: Aggregated system diagnostics across 10 micro-agents, DBs, and Ollama.
- **`GET /api/v1/admin/cache/stats`**: Statistics across L1 exact in-memory, L2 Redis semantic, and Tier 2 tool caches.
- **`POST /api/v1/admin/cache/flush`**: Targeted or full cache tier flush (`all`, `domain`, `documentFilename`).
- **`GET /api/v1/admin/team`**: Synced team members with cross-platform identity mapping.
- **`POST /api/v1/admin/team/sync`**: Triggers 4-way parallel team auto-discovery workflow.
- **`GET /api/v1/admin/team/sync/status`**: Background team sync worker status.
- **`POST /api/v1/admin/team`**: Adds a team member profile.
- **`PUT /api/v1/admin/team/:id`**: Updates an existing team member profile.
- **`DELETE /api/v1/admin/team/:id`**: Removes a team member profile.
- **`GET /api/v1/admin/settings`**: Current application, LLM, and MCP configurations with masked secrets.
- **`PUT /api/v1/admin/settings`**: Updates and hot-reloads runtime settings without restarting server.
- **`POST /api/v1/admin/settings/test-connection`**: Tests live connectivity to Ollama, Jira, GitHub, Notion, GCal, or Slack.
- **`POST /api/v1/admin/system/reset-data`**: Safely clears database tables while strictly preserving `app_settings`.

### Temporal HITL Slack Workflows
- **`POST /api/v1/admin/temporal/slack-post/request`**: Holds draft retro/briefing in Temporal HITL queue.
- **`POST /api/v1/admin/temporal/slack-post/approve`**: Sends human approval signal with optional message edits.
- **`POST /api/v1/admin/temporal/slack-post/reject`**: Sends human rejection signal.
- **`GET /api/v1/admin/temporal/slack-post/status`**: Queries workflow approval status.

### Evaluations & Tracing
- **`POST /api/v1/admin/eval/prompt-matrix`**: Dispatches durable Prompt Matrix evaluation via Temporal.
- **`GET /api/v1/admin/eval/prompt-matrix/status`**: Queries Prompt Matrix evaluation status.
- **`POST /api/v1/admin/eval/sync-datasets`**: Synchronizes Golden dataset and Prompt Matrix cases to Langfuse.
- **`POST /api/v1/admin/eval/sync-prompts`**: Synchronizes system prompts into Langfuse Prompt Management.
- **`POST /api/v1/admin/eval/run-deep-benchmark`**: Triggers nightly deep benchmark suite (Ragas + DeepEval + Arena).
- **`GET /api/v1/admin/eval/benchmark-status`**: Status of active benchmark execution.
- **`POST /api/v1/admin/eval/replay-traces`**: Replays historical traces to evaluate candidate model upgrades.
- **`GET /api/v1/admin/eval/replay-status`**: Status of trace replay workflow.
- **`GET /api/v1/admin/eval/metrics`**: Aggregated evaluation benchmarks.
- **`POST /api/v1/feedback`**: Non-blocking thumbs up/down rating submission to Langfuse.

### Atlassian Jira OAuth 2.0 PKCE
- **`GET /api/v1/mcp/jira/oauth/start`**: Initiates 3LO PKCE authorization.
- **`GET /api/v1/mcp/jira/oauth/callback`**: Atlassian OAuth redirect callback endpoint.
- **`GET /api/v1/mcp/jira/oauth/status`**: Current OAuth connection state and token expiry.
- **`POST /api/v1/mcp/jira/oauth/disconnect`**: Revokes tokens and disconnects OAuth.
