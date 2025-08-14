#!/bin/bash

# Start Python microservices for enhanced RAG
# BGE-M3 Embeddings (port 8001) and BGE-Reranker-v2-M3 (port 8002)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐍 Starting Python RAG Microservices...${NC}"
echo ""

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to check if Python virtual environment exists
check_venv() {
    local service_dir=$1
    local venv_path="$service_dir/venv"
    
    if [ ! -d "$venv_path" ]; then
        echo -e "${YELLOW}⚠️  Virtual environment not found in $service_dir${NC}"
        echo -e "${BLUE}📦 Creating virtual environment...${NC}"
        
        cd "$service_dir"
        python3 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
        
        echo -e "${GREEN}✅ Virtual environment created and dependencies installed${NC}"
        cd "$SCRIPT_DIR"
    else
        echo -e "${GREEN}✅ Virtual environment found in $service_dir${NC}"
    fi
}

# Function to start service in background
start_service() {
    local service_name=$1
    local service_dir=$2
    local port=$3
    local log_file=$4
    
    echo -e "${BLUE}🚀 Starting $service_name on port $port...${NC}"
    
    cd "$service_dir"
    source venv/bin/activate
    
    # Check if port is already in use
    if lsof -ti:$port >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port $port is already in use, killing existing process...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Start service in background
    nohup python app.py > "$log_file" 2>&1 &
    local pid=$!
    
    echo -e "${GREEN}✅ $service_name started with PID $pid${NC}"
    echo "$pid" > "${service_name,,}.pid"
    
    cd "$SCRIPT_DIR"
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to be ready on port $port...${NC}"
    
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$port/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is ready (attempt $attempt/$max_attempts)${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}   Attempt $attempt/$max_attempts: $service_name not ready yet, waiting 3 seconds...${NC}"
        sleep 3
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start within $(($max_attempts * 3)) seconds${NC}"
    return 1
}

# Check Python installation
if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}❌ Python 3 not found. Please install Python 3.8+ and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Python found: $(python3 --version)${NC}"

# Setup and start BGE-M3 Embeddings Service
echo ""
echo -e "${BLUE}📋 Setting up BGE-M3 Embeddings Service...${NC}"
check_venv "$SCRIPT_DIR/embeddings"
start_service "BGE-M3-Embeddings" "$SCRIPT_DIR/embeddings" 8001 "$SCRIPT_DIR/embeddings.log"

# Setup and start BGE-Reranker Service
echo ""
echo -e "${BLUE}📋 Setting up BGE-Reranker-v2-M3 Service...${NC}"
check_venv "$SCRIPT_DIR/reranker"
start_service "BGE-Reranker-v2-M3" "$SCRIPT_DIR/reranker" 8002 "$SCRIPT_DIR/reranker.log"

# Wait for services to be ready
echo ""
echo -e "${BLUE}🏥 Performing health checks...${NC}"

if wait_for_service "BGE-M3-Embeddings" 8001; then
    echo -e "${GREEN}✅ BGE-M3 Embeddings Service is healthy${NC}"
else
    echo -e "${RED}❌ BGE-M3 Embeddings Service failed to start${NC}"
fi

if wait_for_service "BGE-Reranker-v2-M3" 8002; then
    echo -e "${GREEN}✅ BGE-Reranker-v2-M3 Service is healthy${NC}"
else
    echo -e "${RED}❌ BGE-Reranker-v2-M3 Service failed to start${NC}"
fi

echo ""
echo -e "${BLUE}📊 Service Status Summary:${NC}"
echo -e "   • BGE-M3 Embeddings: http://localhost:8001"
echo -e "   • BGE-Reranker-v2-M3: http://localhost:8002"
echo ""
echo -e "${BLUE}📝 Log Files:${NC}"
echo -e "   • Embeddings: $SCRIPT_DIR/embeddings.log"
echo -e "   • Reranker: $SCRIPT_DIR/reranker.log"
echo ""
echo -e "${GREEN}🎉 Python RAG microservices are ready!${NC}"

# Show quick test commands
echo ""
echo -e "${BLUE}🧪 Quick Test Commands:${NC}"
echo -e "   curl http://localhost:8001/health"
echo -e "   curl http://localhost:8002/health"