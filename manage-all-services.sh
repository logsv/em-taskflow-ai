#!/bin/bash

# EM-Taskflow Complete Service Manager
# Manages all services: ChromaDB, Ollama, Python BGE services, Backend, Frontend
# Usage: ./manage-all-services.sh [start|stop|restart|status|logs] [service1,service2,...]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Service configuration functions
get_service_port() {
    case $1 in
        chroma) echo "8000" ;;
        ollama) echo "11434" ;;
        bge-embeddings) echo "8001" ;;
        bge-reranker) echo "8002" ;;
        backend) echo "4000" ;;
        frontend) echo "3000" ;;
        *) echo "0" ;;
    esac
}

get_service_desc() {
    case $1 in
        chroma) echo "ChromaDB Vector Database" ;;
        ollama) echo "Ollama LLM Service" ;;
        bge-embeddings) echo "BGE-M3 Embeddings Service" ;;
        bge-reranker) echo "BGE-Reranker-v2-M3 Service" ;;
        backend) echo "EM-Taskflow Backend API" ;;
        frontend) echo "React Frontend" ;;
        *) echo "Unknown Service" ;;
    esac
}

get_service_dir() {
    case $1 in
        chroma|ollama) echo "$SCRIPT_DIR" ;;
        bge-embeddings) echo "$SCRIPT_DIR/python-services/embeddings" ;;
        bge-reranker) echo "$SCRIPT_DIR/python-services/reranker" ;;
        backend) echo "$SCRIPT_DIR/backend" ;;
        frontend) echo "$SCRIPT_DIR/frontend" ;;
        *) echo "$SCRIPT_DIR" ;;
    esac
}

get_log_file() {
    case $1 in
        chroma) echo "$SCRIPT_DIR/chroma.log" ;;
        ollama) echo "$SCRIPT_DIR/ollama.log" ;;
        bge-embeddings) echo "$SCRIPT_DIR/python-services/embeddings.log" ;;
        bge-reranker) echo "$SCRIPT_DIR/python-services/reranker.log" ;;
        backend) echo "$SCRIPT_DIR/backend.log" ;;
        frontend) echo "$SCRIPT_DIR/frontend.log" ;;
        *) echo "/dev/null" ;;
    esac
}

get_pid_file() {
    case $1 in
        chroma) echo "$SCRIPT_DIR/chroma.pid" ;;
        ollama) echo "$SCRIPT_DIR/ollama.pid" ;;
        bge-embeddings) echo "$SCRIPT_DIR/python-services/bge-embeddings.pid" ;;
        bge-reranker) echo "$SCRIPT_DIR/python-services/bge-reranker.pid" ;;
        backend) echo "$SCRIPT_DIR/backend.pid" ;;
        frontend) echo "$SCRIPT_DIR/frontend.pid" ;;
        *) echo "/tmp/unknown.pid" ;;
    esac
}

# All available services
ALL_SERVICES="chroma ollama bge-embeddings bge-reranker backend frontend"

# Function to print usage
print_usage() {
    echo -e "${BLUE}EM-Taskflow Complete Service Manager${NC}"
    echo ""
    echo "Usage: $0 [COMMAND] [SERVICES]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  start     Start services"
    echo "  stop      Stop services"
    echo "  restart   Restart services"
    echo "  status    Show service status"
    echo "  logs      Show service logs"
    echo "  health    Perform health checks"
    echo "  clean     Clean up logs and PID files"
    echo ""
    echo -e "${YELLOW}Services:${NC}"
    for service in $ALL_SERVICES; do
        printf "  %-18s %s (port %s)\n" "$service" "$(get_service_desc "$service")" "$(get_service_port "$service")"
    done
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 start                          # Start all services"
    echo "  $0 start chroma,ollama           # Start specific services"
    echo "  $0 stop backend                  # Stop backend only"
    echo "  $0 status                        # Show status of all services"
    echo "  $0 logs backend                  # Show backend logs"
    echo "  $0 restart bge-embeddings        # Restart BGE embeddings service"
    echo ""
}

# Function to log messages
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")  echo -e "${GREEN}[INFO]${NC} $timestamp - $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $timestamp - $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $timestamp - $message" ;;
        "DEBUG") echo -e "${CYAN}[DEBUG]${NC} $timestamp - $message" ;;
        *)       echo -e "${BLUE}[LOG]${NC} $timestamp - $message" ;;
    esac
}

# Function to check if service is running
is_service_running() {
    local service=$1
    local port=$(get_service_port "$service")
    local pid_file=$(get_pid_file "$service")
    
    # Check by port
    if command -v lsof >/dev/null 2>&1; then
        if lsof -ti:$port >/dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Check by PID file
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" >/dev/null 2>&1; then
            return 0
        else
            # Stale PID file
            rm -f "$pid_file"
        fi
    fi
    
    return 1
}

# Function to wait for service to be ready
wait_for_service() {
    local service=$1
    local max_attempts=${2:-20}
    
    log_message "INFO" "Waiting for $service to be ready..."
    
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if is_service_running "$service"; then
            log_message "INFO" "$service is ready (attempt $attempt/$max_attempts)"
            return 0
        fi
        
        echo -e "${YELLOW}   Attempt $attempt/$max_attempts: $service not ready yet, waiting 3 seconds...${NC}"
        sleep 3
        ((attempt++))
    done
    
    log_message "ERROR" "$service failed to start within $(($max_attempts * 3)) seconds"
    return 1
}

# Function to start ChromaDB
start_chroma() {
    local port=$(get_service_port "chroma")
    local log_file=$(get_log_file "chroma")
    local pid_file=$(get_pid_file "chroma")
    
    if is_service_running "chroma"; then
        log_message "WARN" "ChromaDB is already running on port $port"
        return 0
    fi
    
    log_message "INFO" "Starting ChromaDB on port $port..."
    
    # Check if chroma-env exists
    if [ ! -d "$SCRIPT_DIR/chroma-env" ]; then
        log_message "INFO" "Creating ChromaDB virtual environment..."
        python3 -m venv "$SCRIPT_DIR/chroma-env"
        source "$SCRIPT_DIR/chroma-env/bin/activate"
        pip install --upgrade pip
        pip install chromadb
    fi
    
    # Start ChromaDB
    source "$SCRIPT_DIR/chroma-env/bin/activate"
    nohup chroma run --host 0.0.0.0 --port $port --path "$SCRIPT_DIR/chroma" > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    log_message "INFO" "ChromaDB started with PID $pid"
    wait_for_service "chroma" 15
}

# Function to start Ollama
start_ollama() {
    local port=$(get_service_port "ollama")
    local log_file=$(get_log_file "ollama")
    local pid_file=$(get_pid_file "ollama")
    
    if is_service_running "ollama"; then
        log_message "WARN" "Ollama is already running on port $port"
        return 0
    fi
    
    log_message "INFO" "Starting Ollama on port $port..."
    
    # Set environment variables
    export OLLAMA_HOST="0.0.0.0:$port"
    export OLLAMA_MODELS="$SCRIPT_DIR/ollama-models"
    
    # Start Ollama
    nohup ollama serve > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    log_message "INFO" "Ollama started with PID $pid"
    
    if wait_for_service "ollama" 15; then
        log_message "INFO" "Pulling required Ollama models (this may take time)..."
        ollama pull gpt-oss:latest >/dev/null 2>&1 || true
        ollama pull gpt-oss:20b >/dev/null 2>&1 || true
        ollama pull nomic-embed-text >/dev/null 2>&1 || true
        log_message "INFO" "Ollama models updated"
    fi
}

# Function to start BGE services
start_python_service() {
    local service=$1
    local port=$(get_service_port "$service")
    local dir=$(get_service_dir "$service")
    local log_file=$(get_log_file "$service")
    local pid_file=$(get_pid_file "$service")
    
    if is_service_running "$service"; then
        log_message "WARN" "$service is already running on port $port"
        return 0
    fi
    
    log_message "INFO" "Starting $service on port $port..."
    
    # Setup virtual environment if needed
    if [ ! -d "$dir/venv" ]; then
        log_message "INFO" "Creating Python virtual environment for $service..."
        cd "$dir"
        python3 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    # Start service
    cd "$dir"
    source venv/bin/activate
    nohup python app.py > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    log_message "INFO" "$service started with PID $pid"
    wait_for_service "$service" 20
}

# Function to start Backend
start_backend() {
    local port=$(get_service_port "backend")
    local dir=$(get_service_dir "backend")
    local log_file=$(get_log_file "backend")
    local pid_file=$(get_pid_file "backend")
    
    if is_service_running "backend"; then
        log_message "WARN" "Backend is already running on port $port"
        return 0
    fi
    
    log_message "INFO" "Starting Backend API on port $port..."
    
    # Build if needed
    cd "$dir"
    if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
        log_message "INFO" "Building Backend TypeScript..."
        npm run build
    fi
    
    # Start backend
    nohup npm start > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    log_message "INFO" "Backend started with PID $pid"
    wait_for_service "backend" 20
}

# Function to start Frontend
start_frontend() {
    local port=$(get_service_port "frontend")
    local dir=$(get_service_dir "frontend")
    local log_file=$(get_log_file "frontend")
    local pid_file=$(get_pid_file "frontend")
    
    if is_service_running "frontend"; then
        log_message "WARN" "Frontend is already running on port $port"
        return 0
    fi
    
    log_message "INFO" "Starting React Frontend on port $port..."
    
    # Install dependencies if needed
    cd "$dir"
    if [ ! -d "node_modules" ]; then
        log_message "INFO" "Installing Frontend dependencies..."
        npm install
    fi
    
    # Start frontend
    nohup npm start > "$log_file" 2>&1 &
    local pid=$!
    echo "$pid" > "$pid_file"
    
    log_message "INFO" "Frontend started with PID $pid"
    wait_for_service "frontend" 20
}

# Function to start any service
start_service() {
    case $1 in
        chroma) start_chroma ;;
        ollama) start_ollama ;;
        bge-embeddings|bge-reranker) start_python_service "$1" ;;
        backend) start_backend ;;
        frontend) start_frontend ;;
        *) log_message "ERROR" "Unknown service: $1" ;;
    esac
}

# Function to stop a service
stop_service() {
    local service=$1
    local port=$(get_service_port "$service")
    local pid_file=$(get_pid_file "$service")
    
    log_message "INFO" "Stopping $service..."
    
    # Stop by PID file first
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" >/dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            if ps -p "$pid" >/dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$pid_file"
    fi
    
    # Stop by port if still running and lsof is available
    if command -v lsof >/dev/null 2>&1 && lsof -ti:$port >/dev/null 2>&1; then
        local pids=$(lsof -ti:$port)
        for pid in $pids; do
            kill "$pid" 2>/dev/null || true
            sleep 1
            if ps -p "$pid" >/dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    log_message "INFO" "$service stopped"
}

# Function to get service status
get_service_status() {
    local service=$1
    local port=$(get_service_port "$service")
    local pid_file=$(get_pid_file "$service")
    
    if is_service_running "$service"; then
        local pid_info=""
        if [ -f "$pid_file" ]; then
            pid_info=" (PID: $(cat "$pid_file"))"
        fi
        echo -e "${GREEN}✅ $service${NC} - Running on port $port$pid_info"
        return 0
    else
        echo -e "${RED}❌ $service${NC} - Not running"
        return 1
    fi
}

# Function to show logs
show_logs() {
    local service=$1
    local log_file=$(get_log_file "$service")
    local lines=${2:-50}
    
    if [ -f "$log_file" ]; then
        echo -e "${BLUE}📋 Last $lines lines of $service logs:${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        tail -n "$lines" "$log_file"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        log_message "WARN" "Log file not found for $service: $log_file"
    fi
}

# Function to perform health checks
health_check() {
    local service=$1
    local port=$(get_service_port "$service")
    
    if ! command -v curl >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️ $service${NC} - curl not available, checking by port only"
        if is_service_running "$service"; then
            echo -e "${GREEN}✅ $service${NC} - Running on port $port"
        else
            echo -e "${RED}❌ $service${NC} - Not running"
        fi
        return
    fi
    
    case $service in
        chroma)
            if curl -s --max-time 5 "http://localhost:$port/api/v1/heartbeat" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service${NC} - Healthy"
            else
                echo -e "${RED}❌ $service${NC} - Unhealthy"
            fi
            ;;
        ollama)
            if curl -s --max-time 5 "http://localhost:$port/api/tags" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service${NC} - Healthy"
            else
                echo -e "${RED}❌ $service${NC} - Unhealthy"
            fi
            ;;
        bge-embeddings|bge-reranker)
            if curl -s --max-time 5 "http://localhost:$port/health" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service${NC} - Healthy"
            else
                echo -e "${RED}❌ $service${NC} - Unhealthy"
            fi
            ;;
        backend)
            if curl -s --max-time 5 "http://localhost:$port/api/health" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service${NC} - Healthy"
            else
                echo -e "${RED}❌ $service${NC} - Unhealthy"
            fi
            ;;
        frontend)
            if curl -s --max-time 5 "http://localhost:$port" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service${NC} - Healthy"
            else
                echo -e "${RED}❌ $service${NC} - Unhealthy"
            fi
            ;;
    esac
}

# Function to clean up
clean_up() {
    log_message "INFO" "Cleaning up logs and PID files..."
    
    for service in $ALL_SERVICES; do
        local log_file=$(get_log_file "$service")
        local pid_file=$(get_pid_file "$service")
        
        if [ -f "$log_file" ]; then
            > "$log_file"  # Truncate log file
            log_message "DEBUG" "Cleaned log file: $log_file"
        fi
        
        if [ -f "$pid_file" ]; then
            rm -f "$pid_file"
            log_message "DEBUG" "Removed PID file: $pid_file"
        fi
    done
    
    log_message "INFO" "Cleanup completed"
}

# Function to parse service list
parse_services() {
    local service_arg=$1
    
    if [ -z "$service_arg" ] || [ "$service_arg" == "all" ]; then
        echo "$ALL_SERVICES"
        return
    fi
    
    # Replace commas with spaces
    local services=$(echo "$service_arg" | tr ',' ' ')
    
    # Validate services
    for service in $services; do
        local valid=false
        for valid_service in $ALL_SERVICES; do
            if [ "$service" == "$valid_service" ]; then
                valid=true
                break
            fi
        done
        
        if [ "$valid" == "false" ]; then
            log_message "ERROR" "Unknown service: $service"
            echo -e "${YELLOW}Available services: $ALL_SERVICES${NC}"
            exit 1
        fi
    done
    
    echo "$services"
}

# Main execution
main() {
    local command=$1
    local service_list=$2
    
    case $command in
        start)
            log_message "INFO" "Starting EM-Taskflow services..."
            services=$(parse_services "$service_list")
            
            for service in $services; do
                start_service "$service"
                echo ""
            done
            
            log_message "INFO" "Service startup completed"
            echo ""
            echo -e "${BLUE}🔗 Service URLs:${NC}"
            echo -e "   • Frontend: http://localhost:3000"
            echo -e "   • Backend API: http://localhost:4000/api"
            echo -e "   • ChromaDB: http://localhost:8000"
            echo -e "   • Ollama: http://localhost:11434"
            echo -e "   • BGE-M3 Embeddings: http://localhost:8001"
            echo -e "   • BGE-Reranker: http://localhost:8002"
            ;;
            
        stop)
            log_message "INFO" "Stopping EM-Taskflow services..."
            services=$(parse_services "$service_list")
            
            # Reverse order for stopping
            reversed_services=""
            for service in $services; do
                reversed_services="$service $reversed_services"
            done
            
            for service in $reversed_services; do
                stop_service "$service"
            done
            
            log_message "INFO" "Service shutdown completed"
            ;;
            
        restart)
            log_message "INFO" "Restarting EM-Taskflow services..."
            services=$(parse_services "$service_list")
            
            # Stop in reverse order
            reversed_services=""
            for service in $services; do
                reversed_services="$service $reversed_services"
            done
            
            for service in $reversed_services; do
                stop_service "$service"
            done
            
            sleep 3
            
            # Start in normal order
            for service in $services; do
                start_service "$service"
            done
            
            log_message "INFO" "Service restart completed"
            ;;
            
        status)
            echo -e "${BLUE}📊 EM-Taskflow Service Status:${NC}"
            echo ""
            services=$(parse_services "$service_list")
            
            for service in $services; do
                get_service_status "$service"
            done
            ;;
            
        logs)
            if [ -n "$service_list" ] && [ "$service_list" != "all" ]; then
                services=$(parse_services "$service_list")
                for service in $services; do
                    show_logs "$service" 50
                    echo ""
                done
            else
                log_message "ERROR" "Please specify a service for logs"
                echo "Example: $0 logs backend"
                exit 1
            fi
            ;;
            
        health)
            echo -e "${BLUE}🏥 EM-Taskflow Health Checks:${NC}"
            echo ""
            services=$(parse_services "$service_list")
            
            for service in $services; do
                health_check "$service"
            done
            ;;
            
        clean)
            clean_up
            ;;
            
        help|--help|-h|"")
            print_usage
            ;;
            
        *)
            log_message "ERROR" "Unknown command: $command"
            print_usage
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"