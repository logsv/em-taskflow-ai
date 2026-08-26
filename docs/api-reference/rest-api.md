# REST API Reference

EM TaskFlow AI provides an interactive **Swagger API Explorer** mounted at `http://localhost:4000/api/docs` and an OpenAPI 3.1 specification at `http://localhost:4000/api/docs/openapi.json`.

---

## ⚡ Interactive Swagger UI

Open [`http://localhost:4000/api/docs`](http://localhost:4000/api/docs) in your browser to test endpoints interactively with custom parameters and sample payloads.

---

## 📡 Endpoint Catalog

### System & Health
- **`GET /api/health`**: Returns system health status, DB connectivity, and LLM readiness.

### Chat & Inference
- **`POST /api/chat`**: Primary chat endpoint supporting multi-agent routing, baseline RAG, and file attachments.
  ```json
  {
    "message": "Calculate DORA metrics for repository backend",
    "threadId": "th_12345",
    "mode": "advanced"
  }
  ```

### Session & Thread Management
- **`GET /api/sessions?page=1&limit=10`**: Returns paginated session list with active thread titles.
- **`POST /api/sessions`**: Initializes a new chat session.
- **`GET /api/session`**: Resolves current session context from cookies.
- **`POST /api/threads`**: Creates a new thread for the current session.
- **`POST /api/sessions/:sessionId/switch`**: Switches active thread.
- **`GET /api/threads/:threadId/messages`**: Retrieves message history.

### Engineering Management (EM)
- **`GET /api/em/dora`**: Returns DORA 4 metrics with tier ratings (*Elite*, *High*, *Medium*, *Low*).
- **`GET /api/em/sprints`**: Returns sprint velocity, committed vs completed story points, and WIP limits.
- **`GET /api/em/okrs`**: Returns quarterly OKR progress and pacing scores.
- **`GET /api/em/sbi`**: Returns structured SBI feedback records.

### Document Ingestion & Vector Storage
- **`POST /api/rag/upload`**: Multipart file upload (PDF, CSV, TXT, PNG/JPG) processed via Temporal.
- **`GET /api/admin/documents`**: Lists all ingested documents and chunk counts.
- **`GET /api/admin/documents/:filename/chunks`**: Retrieves extracted text chunks for inspector modal.
- **`DELETE /api/admin/documents/:filename`**: Deletes document and purges vector embeddings.

### Temporal Human-in-the-Loop (HITL) Slack Post Governance
- **`POST /api/admin/temporal/slack-post/request`**: Initiates a draft Slack post workflow held in `PENDING_HUMAN_APPROVAL`.
- **`POST /api/admin/temporal/slack-post/approve`**: Dispatches human approval signal to trigger `postSlackMessageActivity`.
- **`POST /api/admin/temporal/slack-post/reject`**: Dispatches human rejection signal to abort draft message.
- **`GET /api/admin/temporal/slack-post/status`**: Queries execution state of a Slack post Temporal workflow.

### Telemetry & Feedback
- **`POST /api/feedback`**: Submits non-blocking thumbs up / down ratings to Langfuse telemetry.
