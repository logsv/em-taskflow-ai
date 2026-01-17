#!/bin/bash

# EM TaskFlow - Simple Service Stopper
# Stops: Backend, Frontend, Python BGE Services

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🛑 Stopping EM TaskFlow Services...${NC}"
echo ""

# Stop Ollama
if [ -f "$SCRIPT_DIR/ollama.pid" ]; then
    OLLAMA_PID=$(cat "$SCRIPT_DIR/ollama.pid")
    if kill -0 $OLLAMA_PID 2>/dev/null; then
        kill $OLLAMA_PID
        echo -e "${GREEN}✅ Ollama stopped (PID: $OLLAMA_PID)${NC}"
    else
        echo -e "${YELLOW}⚠️  Ollama was not running${NC}"
    fi
    rm -f "$SCRIPT_DIR/ollama.pid"
else
    # Try to stop any running Ollama processes
    pkill -f ollama 2>/dev/null && echo -e "${GREEN}✅ Ollama processes stopped${NC}" || echo -e "${YELLOW}⚠️  No Ollama processes found${NC}"
fi

# Stop Backend
if [ -f "$SCRIPT_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$SCRIPT_DIR/backend.pid")
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        echo -e "${GREEN}✅ Backend stopped (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend was not running${NC}"
    fi
    rm -f "$SCRIPT_DIR/backend.pid"
else
    echo -e "${YELLOW}⚠️  Backend PID file not found${NC}"
fi

# Stop Frontend
if [ -f "$SCRIPT_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$SCRIPT_DIR/frontend.pid")
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        echo -e "${GREEN}✅ Frontend stopped (PID: $FRONTEND_PID)${NC}"
    else
        echo -e "${YELLOW}⚠️  Frontend was not running${NC}"
    fi
    rm -f "$SCRIPT_DIR/frontend.pid"
else
    echo -e "${YELLOW}⚠️  Frontend PID file not found${NC}"
fi

echo ""
echo -e "${GREEN}🎉 All services stopped!${NC}"
echo ""
echo -e "${BLUE}📋 Clean up completed:${NC}"
echo "   🦙 Ollama:   Stopped"
echo "   🔧 Backend:  Stopped"
echo "   ⚛️  Frontend: Stopped"
echo ""
echo -e "${GREEN}💡 All EM TaskFlow services have been stopped${NC}"
echo ""
