# Troubleshooting & Diagnostics

Common issues, empirical diagnostics, and resolution steps for operators and developers.

---

## 🔍 Diagnostic Checklist

### 1. Ollama LLM Connection Timeout
- **Symptom**: `ECONNREFUSED 127.0.0.1:11434` or model generation hangs.
- **Fix**:
  1. Confirm Ollama is running: `curl http://localhost:11434/api/tags`.
  2. If inside Docker, verify `OLLAMA_BASE_URL=http://host.docker.internal:11434` and `extra_hosts` is configured in `docker-compose.yml`.
  3. Ensure required models are pulled: `ollama pull hermes3:8b && ollama pull nomic-embed-text`.

### 2. Database Connection or Port Conflicts
- **Symptom**: `database "taskflow_ai" does not exist` or `port 5432 already in use`.
- **Fix**:
  1. Verify running database containers: `docker compose ps`.
  2. Inspect database initialization: `docker exec em-taskflow-postgres psql -U taskflow -d postgres -c "\l"`.
  3. Ensure `init-databases.sql` initialized `taskflow_backend` and `taskflow_ai`.

### 3. MCP Tool Circuit Breaker Tripping
- **Symptom**: Jira or GitHub tool calls immediately return fallback data with status `circuit_breaker_open`.
- **Fix**:
  1. Check token validity in `backend/.env` (`GITHUB_TOKEN`, `NOTION_API_KEY`).
  2. Test direct tool connectivity via Admin Portal at `http://localhost:3000/admin`.
  3. Restart the backend container to reset the circuit breaker: `docker compose restart backend`.
