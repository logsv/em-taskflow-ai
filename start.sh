#!/bin/bash

# EM TaskFlow - Simple Service Starter
# Starts: Ollama, Python Backend, Frontend

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🚀 Starting EM TaskFlow Services...${NC}"
echo ""

# Step 1: Stop and Start Ollama to ensure clean state
echo -e "${BLUE}🦙 Managing Ollama service...${NC}"
pkill -f ollama 2>/dev/null && echo -e "${YELLOW}⚠️  Stopped existing Ollama processes${NC}" || echo -e "${BLUE}ℹ️  No existing Ollama processes found${NC}"

# Start Ollama in background
ollama serve > "$SCRIPT_DIR/ollama.log" 2>&1 &
OLLAMA_PID=$!
echo $OLLAMA_PID > "$SCRIPT_DIR/ollama.pid"
echo -e "${GREEN}✅ Ollama started (PID: $OLLAMA_PID)${NC}"

# Wait for Ollama to be ready
echo -e "${BLUE}⏳ Waiting for Ollama to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Ollama failed to start within 30 seconds${NC}"
        exit 1
    fi
    sleep 1
done

# Ensure required models are available
echo -e "${BLUE}📥 Checking required models...${NC}"
if ! ollama list | grep -q "llama3.2:latest"; then
    echo -e "${BLUE}📥 Pulling llama3.2:latest...${NC}"
    ollama pull llama3.2:latest
fi
if ! ollama list | grep -q "nomic-embed-text"; then
    echo -e "${BLUE}📥 Pulling nomic-embed-text...${NC}"
    ollama pull nomic-embed-text
fi
echo -e "${GREEN}✅ All required models available${NC}"

# Step 2: Start Python Backend (FastAPI)
echo -e "${BLUE}🔥 Starting Python Backend (FastAPI)...${NC}"
cd "$SCRIPT_DIR/backend"

# Create/Activate venv
if [ ! -d "venv" ]; then
    echo -e "${BLUE}📦 Creating virtual environment...${NC}"
    /usr/bin/python3 -m venv venv
fi
source venv/bin/activate

# Install dependencies if requirements changed
echo -e "${BLUE}⬇️  Installing dependencies...${NC}"
pip install -q -r requirements.txt

# Start FastAPI
echo -e "${GREEN}✅ Starting FastAPI server on port 4000...${NC}"
python -m uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload > "$SCRIPT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$SCRIPT_DIR/backend.pid"

cd "$SCRIPT_DIR"

# Step 3: Start Frontend
echo -e "${BLUE}⚛️  Starting React Frontend...${NC}"
cd "$SCRIPT_DIR/frontend"
echo -e "${GREEN}✅ Starting Frontend dev server...${NC}"
npm start > "$SCRIPT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$SCRIPT_DIR/frontend.pid"

cd "$SCRIPT_DIR"

echo -e "${GREEN}✨ All services started!${NC}"
echo -e "   - Frontend: http://localhost:3000"
echo -e "   - Backend: http://localhost:4000"
echo -e "   - Ollama: http://localhost:11434"
echo ""
echo -e "${YELLOW}📝 Logs are being written to *.log files in this directory${NC}"
echo -e "${YELLOW}Use ./stop.sh to stop all services${NC}"
