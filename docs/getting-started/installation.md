# Installation & Quickstart

This guide walks you through setting up and running EM TaskFlow AI either using **Docker Compose (Recommended)** or via **Local Development**.

---

## 📋 System Prerequisites

- **Operating System**: macOS (Apple Silicon or Intel), Linux (Ubuntu/Debian/RHEL), or Windows (WSL2)
- **RAM**: Minimum 8 GB (16 GB+ recommended for local Ollama SLMs)
- **Container Engine**: Docker Desktop or Docker Engine 24+ with Docker Compose v2+
- **Local LLM Engine**: [Ollama](https://ollama.ai) installed and running locally
- **Node.js**: v20+ (for local backend development)
- **Python**: v3.12+ with `uv` package manager (for Python AI service)

---

## ⚡ Option A: Docker Compose (Recommended)

### 1. Clone the Repository
```bash
git clone https://github.com/logsv/em-taskflow-ai.git
cd em-taskflow-ai
```

### 2. Pull Required Ollama Models
Ensure Ollama is running on your host machine, then pull the default reasoning and embedding models:
```bash
ollama pull hermes3:8b
ollama pull nomic-embed-text
```

### 3. Configure Environment Variables
Copy example environment templates:
```bash
cp backend/.env.example backend/.env
```

Review and adjust any optional MCP tokens (`GITHUB_TOKEN`, `SLACK_BOT_TOKEN`, `NOTION_API_KEY`).

### 4. Launch the Complete Container Stack
```bash
docker compose up -d --build
```

### 5. Access Services & Portals

| Application | URL | Description |
| :--- | :--- | :--- |
| **Frontend Chat Cockpit** | [`http://localhost:3000`](http://localhost:3000) | Primary React chat & document cockpit |
| **Standalone Admin Portal** | [`http://localhost:3000/admin`](http://localhost:3000/admin) | Operational dashboard & service hub |
| **Swagger API Explorer** | [`http://localhost:4000/api/docs`](http://localhost:4000/api/docs) | Interactive OpenAPI REST test explorer |
| **Langfuse AI Telemetry** | [`http://localhost:3001`](http://localhost:3001) | Multi-agent execution traces & token telemetry |
| **Promptfoo Matrix Server** | [`http://localhost:15500`](http://localhost:15500) | Side-by-side prompt & provider matrix viewer |
| **Adminer Postgres Explorer** | [`http://localhost:8080`](http://localhost:8080) | Database explorer for isolated DBs |
| **Temporal Web UI** | [`http://localhost:8233`](http://localhost:8233) | Durable workflow execution visualizer |
| **Backend Health Check** | [`http://localhost:4000/api/health`](http://localhost:4000/api/health) | Live backend service health endpoint |

---

## 🛠️ Option B: Local Development Setup

### 1. Start Infrastructure Services (PostgreSQL + Redis)
```bash
docker compose up -d postgres redis analytics-db temporal temporal-ui
```

### 2. Start Python AI Microservice
```bash
cd services/python-ai-service
uv run python app/main.py
```
*(Runs FastAPI REST on port 8000 & gRPC on port 50051).*

### 3. Start Backend Express API
```bash
cd backend
npm install
npm run dev
```
*(Runs Express API on port 4000).*

### 4. Start Frontend React Cockpit
```bash
cd frontend
npm install
npm run dev
```
*(Runs Vite development server on port 3000).*

---

## 🧪 Post-Installation Verification

Run the automated test suites to verify that your environment is 100% operational:

```bash
# Run 240 backend unit test specs
cd backend && npm test

# Run 39 Python AI test specs
cd services/python-ai-service && uv run pytest
```
