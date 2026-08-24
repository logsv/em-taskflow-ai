# MCP Integrations & Tool Harness Architecture

EM TaskFlow AI integrates with external developer platforms using the **Model Context Protocol (MCP)** and standardized REST tool harnesses.

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

## 🗄️ Dual-Layer Database Resiliency

If an external service is offline, unconfigured, or rate-limited:
1. The tool harness catches the exception.
2. Queries the local PostgreSQL cache (`taskflow_backend` tables: `github_issues`, `dora_snapshots`, `sprint_analytics`, `okr_records`).
3. If PostgreSQL is temporarily unreachable, in-memory caches provide a secondary fallback layer.
4. Returns real snapshot data with clear metadata provenance indicators.
