#!/bin/bash

# EM-Taskflow Service Management Script
# Manages Backend, Frontend, and Ollama services for RAG+MCP+Agent integration

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
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# PID files
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"
OLLAMA_PID_FILE="$PROJECT_DIR/.ollama.pid"

# Function to display banner
show_banner() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    EM-Taskflow Manager                      ║${NC}"
    echo -e "${CYAN}║              RAG + MCP + Agent Integration                   ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
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
    
    # Start Ollama server
    OLLAMA_HOST="127.0.0.1:$OLLAMA_PORT" nohup ollama serve > "$PROJECT_DIR/ollama.log" 2>&1 &
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
    if ! curl -s "http://127.0.0.1:$OLLAMA_PORT/api/tags" | grep -q "deepseek-r1:latest"; then
        echo -e "${YELLOW}⬇️  Pulling LLM model: deepseek-r1:latest${NC}"
        ollama pull deepseek-r1:latest
    else
        echo -e "${GREEN}✅ LLM model 'deepseek-r1:latest' is available${NC}"
    fi
    
    # Check and pull embedding model
    if ! curl -s "http://127.0.0.1:$OLLAMA_PORT/api/tags" | grep -q "nomic-embed-text"; then
        echo -e "${YELLOW}⬇️  Pulling embedding model: nomic-embed-text${NC}"
        ollama pull nomic-embed-text
    else
        echo -e "${GREEN}✅ Embedding model 'nomic-embed-text' is available${NC}"
    fi
    
    echo -e "${GREEN}🎉 Ollama ready with both LLM and embedding models!${NC}"
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
    
    # Build the backend
    echo -e "${YELLOW}🔨 Building backend...${NC}"
    npm run build
    
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
    echo -e "   • Ollama API: http://localhost:$OLLAMA_PORT/api"
}

# Function to start all services
start_all() {
    echo -e "${PURPLE}🚀 Starting all services for RAG+MCP+Agent integration...${NC}"
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
    echo -e "  start         Start all services (Ollama, Backend, Frontend)"
    echo -e "  stop          Stop all services"
    echo -e "  restart       Restart all services"
    echo -e "  status        Show service status"
    echo -e "  ollama        Start only Ollama with models"
    echo -e "  backend       Start only Backend"
    echo -e "  frontend      Start only Frontend"
    echo -e "  help          Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0 start      # Start all services"
    echo -e "  $0 restart    # Restart all services"
    echo -e "  $0 status     # Check service status"
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
