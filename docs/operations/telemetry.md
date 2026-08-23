# Telemetry & Observability

Observability in EM TaskFlow AI is powered by self-hosted **Langfuse**, **OpenTelemetry**, and non-blocking background trace logging.

---

## 📊 Langfuse AI Telemetry

- **Dashboard URL**: `http://localhost:3001`
- **Database**: Dedicated PostgreSQL database `langfuse_db` on port `5433` (`analytics-db`).
- **Capabilities**:
  - Full multi-agent execution trees and worker transitions
  - Token consumption and cost breakdowns per query
  - End-to-end latency breakdowns across MCP tool calls
  - User feedback scores (thumbs up / thumbs down)

---

## 🛡️ Rule of Zero-Downtime Telemetry

All tracing callbacks in `backend/src/utils/tracer.js` and `services/python-ai-service/app/telemetry/tracer.py` are wrapped in non-blocking handlers. If the Langfuse server or analytics database is temporarily unreachable:
1. Tracing errors are logged as warnings.
2. User chat requests, document uploads, and Admin Portal operations continue processing with zero failure.
