#!/bin/bash

# EM TaskFlow - Simple Service Starter
# Starts: Ollama, Backend, Frontend, Python BGE Services

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

# Step 2: Build Backend TypeScript
echo -e "${BLUE}🔨 Building TypeScript backend...${NC}"
cd "$SCRIPT_DIR/backend"
if npm run build; then
    echo -e "${GREEN}✅ Backend build completed${NC}"
else
    echo -e "${RED}❌ Backend build failed${NC}"
    exit 1
fi
cd "$SCRIPT_DIR"

# Step 3: Start Python BGE Services (optional for RAG)
echo -e "${BLUE}🐍 Starting Python BGE services...${NC}"
if [ -d "$SCRIPT_DIR/python-services" ]; then
    cd "$SCRIPT_DIR/python-services"
    
    # Stop any existing Python services
    pkill -f "python.*app.py" 2>/dev/null && echo -e "${YELLOW}⚠️  Stopped existing Python services${NC}" || true
    
    # Check if start script exists and run it
    if [ -x "./start-services.sh" ]; then
        echo -e "${BLUE}   🚀 Starting BGE services...${NC}"
        ./start-services.sh > "$SCRIPT_DIR/python-services.log" 2>&1 &
        echo $! > "$SCRIPT_DIR/python-services.pid"
        
        # Wait a moment for services to start
        sleep 3
        
        # Check if services are running
        if curl -s http://localhost:8001/health >/dev/null 2>&1 && curl -s http://localhost:8002/health >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Python BGE services started successfully${NC}"
        else
            echo -e "${YELLOW}⚠️  Python BGE services started but may need more time to initialize${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Python BGE services script not found (optional)${NC}"
    fi
    cd "$SCRIPT_DIR"
else
    echo -e "${YELLOW}⚠️  Python services directory not found (optional)${NC}"
fi

# Step 4: Start Backend
echo -e "${BLUE}🔧 Starting Backend server...${NC}"
cd "$SCRIPT_DIR/backend"

# Start backend with proper environment variables
NOTION_API_KEY="${NOTION_API_KEY}" \
LLM_DEFAULT_MODEL="${LLM_DEFAULT_MODEL:-llama3.2:latest}" \
npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid

echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"
echo "   📋 Logs: $SCRIPT_DIR/backend.log"
echo "   🔗 Health: http://127.0.0.1:4000/api/health"

cd "$SCRIPT_DIR"

# Step 5: Start Frontend
echo -e "${BLUE}⚛️  Starting Frontend server...${NC}"
cd "$SCRIPT_DIR/frontend"

# Start frontend in background
npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../frontend.pid

echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
echo "   📋 Logs: $SCRIPT_DIR/frontend.log"
echo "   🌐 URL: http://localhost:3000"

cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}🎉 All services started successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
echo "   🦙 Ollama:   http://localhost:11434/api/tags"
echo "   🔧 Backend:  http://127.0.0.1:4000/api/health"
echo "   ⚛️  Frontend: http://localhost:3000"
echo "   🐍 Python:   http://localhost:8001/health (BGE Embeddings)"
echo "   🔄 Python:   http://localhost:8002/health (BGE Reranker)"
echo ""
echo -e "${BLUE}📋 Management:${NC}"
echo "   🛑 Stop all: ./stop.sh"
echo "   📄 Backend logs: tail -f backend.log"
echo "   📄 Frontend logs: tail -f frontend.log"
echo "   📄 Ollama logs: tail -f ollama.log"
echo "   📄 Python logs: tail -f python-services.log"
echo ""
echo -e "${GREEN}💡 All services are now running with Llama 3.2!${NC}"
echo ""
