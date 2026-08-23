# Production Deployment & Container Management

EM TaskFlow AI is packaged as a multi-container Docker Compose application ready for on-premise or cloud VM deployment.

---

## 🐳 Docker Services Architecture

```yaml
services:
  em-taskflow-backend:       # Node.js API (Port 4000)
  em-taskflow-python-ai:     # FastAPI / gRPC (Ports 8000 & 50051)
  em-taskflow-frontend:      # React SPA / Nginx (Port 3000)
  em-taskflow-postgres:      # PostgreSQL 16 pgvector (Port 5432)
  em-taskflow-redis:         # Redis 7 Alpine (Port 6379)
  em-taskflow-analytics-db:  # Langfuse Postgres (Port 5433)
  em-taskflow-langfuse:      # Langfuse Web UI (Port 3001)
  em-taskflow-adminer:       # Adminer DB Explorer (Port 8080)
  em-taskflow-temporal:      # Temporal Server (Port 7233)
  em-taskflow-temporal-ui:   # Temporal Web UI (Port 8233)
```

---

## 🛠️ Management Commands

```bash
# Build and start all services in background
docker compose up -d --build

# Inspect container health and port bindings
docker compose ps

# Follow logs across core services
docker compose logs -f backend python-ai-service postgres redis

# Clean teardown (preserving database volumes)
docker compose down

# Full purge (including persistent volume data)
docker compose down -v
```
