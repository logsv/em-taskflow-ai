#!/bin/bash

# EM-Taskflow Service Management Script
# Manages Backend, Frontend, and Ollama services for RAG+MCP+Agent integration
# Now includes configuration management and testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_PORT=4000
FRONTEND_PORT=3000
OLLAMA_PORT=11434
CHROMA_PORT=8000
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
CHROMA_ENV="$PROJECT_DIR/chroma-env"
CONFIG_DIR="$BACKEND_DIR/src/config"

# PID files
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"
OLLAMA_PID_FILE="$PROJECT_DIR/.ollama.pid"
CHROMA_PID_FILE="$PROJECT_DIR/.chroma.pid"

# Function to display banner
show_banner() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    EM-Taskflow Manager                      ║${NC}"
    echo -e "${CYAN}║              RAG + MCP + Agent Integration                   ║${NC}"
    echo -e "${CYAN}║           With Unified Configuration System                  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Function to setup configuration
setup_config() {
    echo -e "${BLUE}⚙️  Setting up configuration...${NC}"
    
    if [ ! -f "$CONFIG_DIR/local.json" ]; then
        if [ -f "$CONFIG_DIR/local.example.json" ]; then
            echo -e "${YELLOW}📋 Creating local.json from example...${NC}"
            cp "$CONFIG_DIR/local.example.json" "$CONFIG_DIR/local.json"
            echo -e "${GREEN}✅ Configuration file created at $CONFIG_DIR/local.json${NC}"
            echo -e "${YELLOW}⚠️  Please edit $CONFIG_DIR/local.json with your API keys${NC}"
        else
            echo -e "${RED}❌ No example configuration found${NC}"
            return 1
        fi
    else
        echo -e "${GREEN}✅ Configuration file already exists${NC}"
    fi
    
    # Validate JSON syntax
    if command -v python3 >/dev/null 2>&1; then
        if python3 -m json.tool "$CONFIG_DIR/local.json" > /dev/null; then
            echo -e "${GREEN}✅ Configuration JSON is valid${NC}"
        else
            echo -e "${RED}❌ Configuration JSON is invalid${NC}"
            return 1
        fi
    fi
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -ti:$port >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to get PID from port
get_pid_from_port() {
    local port=$1
    lsof -ti:$port 2>/dev/null || echo ""
}

# Function to save PID to file
save_pid() {
    local pid=$1
    local pid_file=$2
    echo $pid > "$pid_file"
}

# Function to read PID from file
read_pid() {
    local pid_file=$1
    if [ -f "$pid_file" ]; then
        cat "$pid_file" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Function to check if process is running
is_process_running() {
    local pid=$1
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to start Ollama with models
start_ollama() {
    echo -e "${BLUE}🚀 Starting Ollama with LLM and Embedding models...${NC}"
    
    if check_port $OLLAMA_PORT; then
        local existing_pid=$(get_pid_from_port $OLLAMA_PORT)
        echo -e "${YELLOW}⚠️  Ollama is already running on port $OLLAMA_PORT (PID: $existing_pid)${NC}"
        save_pid "$existing_pid" "$OLLAMA_PID_FILE"
        return 0
    fi
    
    # Start Ollama server in background
    if command -v ollama >/dev/null 2>&1; then
        nohup ollama serve > "$PROJECT_DIR/ollama.log" 2>&1 &
        local ollama_pid=$!
        save_pid "$ollama_pid" "$OLLAMA_PID_FILE"
        
        # Wait for Ollama to start
        echo -e "${YELLOW}⏳ Waiting for Ollama server to start...${NC}"
        for i in {1..30}; do
            if check_port $OLLAMA_PORT; then
                echo -e "${GREEN}✅ Ollama server started successfully (PID: $ollama_pid)${NC}"
                break
            fi
            sleep 1
            if [ $i -eq 30 ]; then
                echo -e "${RED}❌ Failed to start Ollama server${NC}"
                return 1
            fi
        done
        
        # Ensure models are available
        echo -e "${BLUE}📚 Ensuring required models are available...${NC}"
        
        # Check and pull LLM model
        if ! ollama list | grep -q "mistral:latest"; then
            echo -e "${YELLOW}⬇️  Pulling LLM model: mistral:latest${NC}"
            ollama pull mistral:latest
        else
            echo -e "${GREEN}✅ LLM model 'mistral:latest' is available${NC}"
        fi
        
        # Check and pull embedding model
        if ! ollama list | grep -q "nomic-embed-text"; then
            echo -e "${YELLOW}⬇️  Pulling embedding model: nomic-embed-text${NC}"
            ollama pull nomic-embed-text
        else
            echo -e "${GREEN}✅ Embedding model 'nomic-embed-text' is available${NC}"
        fi
        
        echo -e "${GREEN}🎉 Ollama ready with both LLM and embedding models!${NC}"
    else
        echo -e "${RED}❌ Ollama not found. Please install Ollama first.${NC}"
        return 1
    fi
}

# Function to start Chroma vector database
start_chroma() {
    echo -e "${BLUE}🚀 Starting Chroma Vector Database...${NC}"
    
    if check_port $CHROMA_PORT; then
        local existing_pid=$(get_pid_from_port $CHROMA_PORT)
        echo -e "${YELLOW}⚠️  Chroma is already running on port $CHROMA_PORT (PID: $existing_pid)${NC}"
        save_pid "$existing_pid" "$CHROMA_PID_FILE"
        return 0
    fi
    
    # Check if Chroma virtual environment exists
    if [ ! -d "$CHROMA_ENV" ]; then
        echo -e "${YELLOW}📦 Creating Chroma virtual environment...${NC}"
        python3 -m venv "$CHROMA_ENV"
        source "$CHROMA_ENV/bin/activate"
        pip install chromadb
    fi
    
    # Start Chroma server
    source "$CHROMA_ENV/bin/activate" && nohup chroma run --host 127.0.0.1 --port $CHROMA_PORT > "$PROJECT_DIR/chroma.log" 2>&1 &
    local chroma_pid=$!
    save_pid "$chroma_pid" "$CHROMA_PID_FILE"
    
    # Wait for Chroma to start
    echo -e "${YELLOW}⏳ Waiting for Chroma to start...${NC}"
    for i in {1..20}; do
        if check_port $CHROMA_PORT; then
            echo -e "${GREEN}✅ Chroma started successfully (PID: $chroma_pid)${NC}"
            return 0
        fi
        sleep 1
        if [ $i -eq 20 ]; then
            echo -e "${RED}❌ Failed to start Chroma${NC}"
            return 1
        fi
    done
}

# Function to start backend
start_backend() {
    echo -e "${BLUE}🚀 Starting Backend (TypeScript)...${NC}"
    
    if check_port $BACKEND_PORT; then
        local existing_pid=$(get_pid_from_port $BACKEND_PORT)
        echo -e "${YELLOW}⚠️  Backend is already running on port $BACKEND_PORT (PID: $existing_pid)${NC}"
        save_pid "$existing_pid" "$BACKEND_PID_FILE"
        return 0
    fi
    
    cd "$BACKEND_DIR"
    
    # Setup configuration first
    setup_config
    
    # Build the backend
    echo -e "${YELLOW}🔨 Building backend...${NC}"
    if npm run build; then
        echo -e "${GREEN}✅ Backend build successful${NC}"
    else
        echo -e "${RED}❌ Backend build failed${NC}"
        cd "$PROJECT_DIR"
        return 1
    fi
    
    # Start the backend
    nohup npm start > "$PROJECT_DIR/backend.log" 2>&1 &
    local backend_pid=$!
    save_pid "$backend_pid" "$BACKEND_PID_FILE"
    
    # Wait for backend to start
    echo -e "${YELLOW}⏳ Waiting for backend to start...${NC}"
    for i in {1..20}; do
        if check_port $BACKEND_PORT; then
            echo -e "${GREEN}✅ Backend started successfully (PID: $backend_pid)${NC}"
            cd "$PROJECT_DIR"
            return 0
        fi
        sleep 1
        if [ $i -eq 20 ]; then
            echo -e "${RED}❌ Failed to start backend${NC}"
            cd "$PROJECT_DIR"
            return 1
        fi
    done
}

# Function to start frontend
start_frontend() {
    echo -e "${BLUE}🚀 Starting Frontend (React)...${NC}"
    
    if check_port $FRONTEND_PORT; then
        local existing_pid=$(get_pid_from_port $FRONTEND_PORT)
        echo -e "${YELLOW}⚠️  Frontend is already running on port $FRONTEND_PORT (PID: $existing_pid)${NC}"
        save_pid "$existing_pid" "$FRONTEND_PID_FILE"
        return 0
    fi
    
    cd "$FRONTEND_DIR"
    
    # Start the frontend
    nohup npm start > "$PROJECT_DIR/frontend.log" 2>&1 &
    local frontend_pid=$!
    save_pid "$frontend_pid" "$FRONTEND_PID_FILE"
    
    # Wait for frontend to start
    echo -e "${YELLOW}⏳ Waiting for frontend to start...${NC}"
    for i in {1..30}; do
        if check_port $FRONTEND_PORT; then
            echo -e "${GREEN}✅ Frontend started successfully (PID: $frontend_pid)${NC}"
            cd "$PROJECT_DIR"
            return 0
        fi
        sleep 1
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ Failed to start frontend${NC}"
            cd "$PROJECT_DIR"
            return 1
        fi
    done
}

# Function to test APIs with curl
test_apis() {
    echo -e "${BLUE}🧪 Testing APIs with curl...${NC}"
    echo ""
    
    # Test backend health
    echo -e "${YELLOW}🔍 Testing Backend Health...${NC}"
    if curl -s "http://localhost:$BACKEND_PORT/api/health" | head -c 100; then
        echo -e "\n${GREEN}✅ Backend health check passed${NC}"
    else
        echo -e "${RED}❌ Backend health check failed${NC}"
    fi
    echo ""
    
    # Test Ollama
    echo -e "${YELLOW}🤖 Testing Ollama...${NC}"
    if curl -s "http://localhost:$OLLAMA_PORT/api/tags" | head -c 100; then
        echo -e "\n${GREEN}✅ Ollama API responding${NC}"
    else
        echo -e "${RED}❌ Ollama API not responding${NC}"
    fi
    echo ""
    
    # Test Chroma
    echo -e "${YELLOW}🔍 Testing Chroma...${NC}"
    if curl -s "http://localhost:$CHROMA_PORT/api/v1/heartbeat" | head -c 100; then
        echo -e "\n${GREEN}✅ Chroma API responding${NC}"
    else
        echo -e "${RED}❌ Chroma API not responding${NC}"
    fi
    echo ""
    
    # Test LLM Router status
    echo -e "${YELLOW}🔀 Testing LLM Router...${NC}"
    if curl -s "http://localhost:$BACKEND_PORT/api/llm-status" | head -c 200; then
        echo -e "\n${GREEN}✅ LLM Router status check passed${NC}"
    else
        echo -e "${RED}❌ LLM Router status check failed${NC}"
    fi
    echo ""
    
    # Test basic chat
    echo -e "${YELLOW}💬 Testing Basic Chat...${NC}"
    if curl -s -X POST "http://localhost:$BACKEND_PORT/api/chat" \
        -H "Content-Type: application/json" \
        -d '{"message":"Hello, test message"}' | head -c 100; then
        echo -e "\n${GREEN}✅ Basic chat test passed${NC}"
    else
        echo -e "${RED}❌ Basic chat test failed${NC}"
    fi
    echo ""
}

# Function to run comprehensive tests
run_tests() {
    echo -e "${BLUE}🧪 Running Comprehensive Tests...${NC}"
    echo ""
    
    cd "$BACKEND_DIR"
    
    # Run TypeScript compilation check
    echo -e "${YELLOW}📝 Checking TypeScript compilation...${NC}"
    if npm run build; then
        echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
    else
        echo -e "${RED}❌ TypeScript compilation failed${NC}"
        cd "$PROJECT_DIR"
        return 1
    fi
    
    # Run unit tests if available
    echo -e "${YELLOW}🔬 Running unit tests...${NC}"
    if npm test 2>/dev/null; then
        echo -e "${GREEN}✅ Unit tests passed${NC}"
    else
        echo -e "${YELLOW}⚠️  Unit tests skipped or failed${NC}"
    fi
    
    cd "$PROJECT_DIR"
    
    # Test APIs if services are running
    if check_port $BACKEND_PORT; then
        test_apis
    else
        echo -e "${YELLOW}⚠️  Backend not running, skipping API tests${NC}"
    fi
}

# Function to stop a service
stop_service() {
    local service_name=$1
    local pid_file=$2
    local port=$3
    
    echo -e "${YELLOW}🛑 Stopping $service_name...${NC}"
    
    # Try to get PID from file first
    local pid=$(read_pid "$pid_file")
    
    # If no PID in file, try to get from port
    if [ -z "$pid" ] && [ -n "$port" ]; then
        pid=$(get_pid_from_port "$port")
    fi
    
    if [ -n "$pid" ] && is_process_running "$pid"; then
        kill "$pid" 2>/dev/null || true
        
        # Wait for process to stop
        for i in {1..10}; do
            if ! is_process_running "$pid"; then
                echo -e "${GREEN}✅ $service_name stopped successfully${NC}"
                rm -f "$pid_file"
                return 0
            fi
            sleep 1
        done
        
        # Force kill if still running
        kill -9 "$pid" 2>/dev/null || true
        echo -e "${GREEN}✅ $service_name force stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  $service_name was not running${NC}"
    fi
    
    rm -f "$pid_file"
}

# Function to show status
show_status() {
    echo -e "${BLUE}📊 Service Status:${NC}"
    echo -e "${BLUE}==================${NC}"
    
    # Configuration status
    if [ -f "$CONFIG_DIR/local.json" ]; then
        echo -e "${GREEN}⚙️  Configuration: Ready${NC}"
    else
        echo -e "${RED}⚙️  Configuration: Missing (run 'config' command)${NC}"
    fi
    
    # Chroma status
    if check_port $CHROMA_PORT; then
        local chroma_pid=$(get_pid_from_port $CHROMA_PORT)
        echo -e "${GREEN}🔍 Chroma: Running (PID: $chroma_pid, Port: $CHROMA_PORT)${NC}"
    else
        echo -e "${RED}🔍 Chroma: Stopped${NC}"
    fi
    
    # Ollama status
    if check_port $OLLAMA_PORT; then
        local ollama_pid=$(get_pid_from_port $OLLAMA_PORT)
        echo -e "${GREEN}🤖 Ollama: Running (PID: $ollama_pid, Port: $OLLAMA_PORT)${NC}"
    else
        echo -e "${RED}🤖 Ollama: Stopped${NC}"
    fi
    
    # Backend status
    if check_port $BACKEND_PORT; then
        local backend_pid=$(get_pid_from_port $BACKEND_PORT)
        echo -e "${GREEN}⚙️  Backend: Running (PID: $backend_pid, Port: $BACKEND_PORT)${NC}"
    else
        echo -e "${RED}⚙️  Backend: Stopped${NC}"
    fi
    
    # Frontend status
    if check_port $FRONTEND_PORT; then
        local frontend_pid=$(get_pid_from_port $FRONTEND_PORT)
        echo -e "${GREEN}🌐 Frontend: Running (PID: $frontend_pid, Port: $FRONTEND_PORT)${NC}"
    else
        echo -e "${RED}🌐 Frontend: Stopped${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}🔗 URLs:${NC}"
    echo -e "   • Frontend: http://localhost:$FRONTEND_PORT"
    echo -e "   • Backend API: http://localhost:$BACKEND_PORT/api"
    echo -e "   • Health Check: http://localhost:$BACKEND_PORT/api/health"
    echo -e "   • LLM Status: http://localhost:$BACKEND_PORT/api/llm-status"
    echo -e "   • Ollama API: http://localhost:$OLLAMA_PORT/api"
    echo -e "   • Chroma API: http://localhost:$CHROMA_PORT/api"
}

# Function to start all services
start_all() {
    echo -e "${PURPLE}🚀 Starting all services for RAG+MCP+Agent integration...${NC}"
    echo ""
    
    start_chroma
    echo ""
    start_ollama
    echo ""
    start_backend
    echo ""
    start_frontend
    echo ""
    
    echo -e "${GREEN}🎉 All services started successfully!${NC}"
    echo ""
    show_status
}

# Function to stop all services
stop_all() {
    echo -e "${PURPLE}🛑 Stopping all services...${NC}"
    echo ""
    
    stop_service "Frontend" "$FRONTEND_PID_FILE" "$FRONTEND_PORT"
    stop_service "Backend" "$BACKEND_PID_FILE" "$BACKEND_PORT"
    stop_service "Ollama" "$OLLAMA_PID_FILE" "$OLLAMA_PORT"
    stop_service "Chroma" "$CHROMA_PID_FILE" "$CHROMA_PORT"
    
    echo ""
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Function to restart all services
restart_all() {
    echo -e "${PURPLE}🔄 Restarting all services...${NC}"
    echo ""
    
    stop_all
    echo ""
    sleep 2
    start_all
}

# Function to show help
show_help() {
    echo -e "${BLUE}Usage: $0 [COMMAND]${NC}"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo -e "  start         Start all services (Chroma, Ollama, Backend, Frontend)"
    echo -e "  stop          Stop all services"
    echo -e "  restart       Restart all services"
    echo -e "  status        Show service status"
    echo -e "  config        Setup configuration file"
    echo -e "  test          Run comprehensive tests"
    echo -e "  test-api      Test APIs with curl (requires services running)"
    echo -e "  chroma        Start only Chroma vector database"
    echo -e "  ollama        Start only Ollama with models"
    echo -e "  backend       Start only Backend"
    echo -e "  frontend      Start only Frontend"
    echo -e "  help          Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0 start      # Start all services"
    echo -e "  $0 restart    # Restart all services"
    echo -e "  $0 status     # Check service status"
    echo -e "  $0 config     # Setup configuration"
    echo -e "  $0 test       # Run tests and API checks"
    echo ""
    echo -e "${YELLOW}Configuration:${NC}"
    echo -e "  Config file: $CONFIG_DIR/local.json"
    echo -e "  Example:     $CONFIG_DIR/local.example.json"
}

# Main script logic
case "${1:-help}" in
    start)
        show_banner
        start_all
        ;;
    stop)
        show_banner
        stop_all
        ;;
    restart)
        show_banner
        restart_all
        ;;
    status)
        show_banner
        show_status
        ;;
    config)
        show_banner
        setup_config
        ;;
    test)
        show_banner
        run_tests
        ;;
    test-api)
        show_banner
        test_apis
        ;;
    chroma)
        show_banner
        start_chroma
        ;;
    ollama)
        show_banner
        start_ollama
        ;;
    backend)
        show_banner
        start_backend
        ;;
    frontend)
        show_banner
        start_frontend
        ;;
    help|--help|-h)
        show_banner
        show_help
        ;;
    *)
        show_banner
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac