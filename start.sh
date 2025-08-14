#!/bin/bash

# Quick Start Script for EM-Taskflow RAG+MCP+Agent System
# Enhanced with robust healthchecks and dependency verification

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting EM-Taskflow RAG+MCP+Agent System...${NC}"
echo ""

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
OLLAMA_PORT=11434
CHROMA_PORT=8000
BACKEND_PORT=4000
MAX_WAIT_TIME=300  # 5 minutes max wait time

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local port=$2
    local max_attempts=$3
    local check_command=$4
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to be ready on port $port...${NC}"
    
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if [ -n "$check_command" ]; then
            # Use custom check command if provided
            if eval "$check_command" >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service_name is ready (attempt $attempt/$max_attempts)${NC}"
                return 0
            fi
        else
            # Default port check
            if lsof -ti:$port >/dev/null 2>&1; then
                echo -e "${GREEN}✅ $service_name is ready (attempt $attempt/$max_attempts)${NC}"
                return 0
            fi
        fi
        
        echo -e "${YELLOW}   Attempt $attempt/$max_attempts: $service_name not ready yet, waiting 3 seconds...${NC}"
        sleep 3
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start within $(($max_attempts * 3)) seconds${NC}"
    return 1
}

# Function to verify Ollama models
verify_ollama_models() {
    echo -e "${BLUE}🔍 Verifying Ollama models...${NC}"
    
    # Check for required models
    local models=("gpt-oss:latest" "nomic-embed-text")
    local missing_models=()
    
    for model in "${models[@]}"; do
        if ! ollama list 2>/dev/null | grep -q "$model"; then
            missing_models+=("$model")
        fi
    done
    
    if [ ${#missing_models[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ All required Ollama models are available${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Missing models: ${missing_models[*]}${NC}"
        echo -e "${BLUE}📥 Pulling missing models...${NC}"
        
        for model in "${missing_models[@]}"; do
            echo -e "${YELLOW}   Pulling $model...${NC}"
            if ollama pull "$model"; then
                echo -e "${GREEN}✅ Successfully pulled $model${NC}"
            else
                echo -e "${RED}❌ Failed to pull $model${NC}"
                return 1
            fi
        done
    fi
    
    return 0
}

# Function to check system dependencies
check_dependencies() {
    echo -e "${BLUE}🔍 Checking system dependencies...${NC}"
    
    local missing_deps=()
    
    # Check for required commands
    local required_commands=("node" "npm" "pnpm" "ollama" "python3" "lsof")
    
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [ ${#missing_deps[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ All required dependencies are available${NC}"
        
        # Show versions
        echo -e "${BLUE}📋 System Information:${NC}"
        echo -e "   Node.js: $(node --version)"
        echo -e "   npm: $(npm --version)"
        echo -e "   pnpm: $(pnpm --version)"
        echo -e "   Python: $(python3 --version)"
        echo -e "   Ollama: $(ollama --version 2>/dev/null || echo 'version not available')"
        
        return 0
    else
        echo -e "${RED}❌ Missing dependencies: ${missing_deps[*]}${NC}"
        echo -e "${YELLOW}Please install missing dependencies and try again.${NC}"
        return 1
    fi
}

# Function to check Node.js version compatibility
check_node_version() {
    if [ -f "$SCRIPT_DIR/backend/.nvmrc" ]; then
        local required_version=$(cat "$SCRIPT_DIR/backend/.nvmrc")
        local current_version=$(node --version | sed 's/v//')
        
        echo -e "${BLUE}🔍 Checking Node.js version compatibility...${NC}"
        echo -e "   Required: v$required_version"
        echo -e "   Current:  v$current_version"
        
        # Simple version check (major.minor comparison)
        local required_major=$(echo "$required_version" | cut -d. -f1)
        local current_major=$(echo "$current_version" | cut -d. -f1)
        
        if [ "$current_major" -ge "$required_major" ]; then
            echo -e "${GREEN}✅ Node.js version is compatible${NC}"
        else
            echo -e "${YELLOW}⚠️  Node.js version might be incompatible. Consider upgrading to v$required_version${NC}"
        fi
    fi
}

# Function to enhanced startup with health checks
enhanced_startup() {
    echo -e "${BLUE}🔧 Enhanced startup with health checks${NC}"
    echo ""
    
    # Step 1: Check dependencies
    if ! check_dependencies; then
        exit 1
    fi
    echo ""
    
    # Step 2: Check Node.js version
    check_node_version
    echo ""
    
    # Step 3: Start services via management script
    echo -e "${BLUE}🚀 Starting services...${NC}"
    "$SCRIPT_DIR/manage-services.sh" start
    
    # Step 4: Enhanced health checks with retries
    echo ""
    echo -e "${BLUE}🏥 Performing enhanced health checks...${NC}"
    
    # Wait for Ollama with model verification
    if ! wait_for_service "Ollama" $OLLAMA_PORT 20; then
        echo -e "${RED}💥 Startup failed: Ollama not ready${NC}"
        exit 1
    fi
    
    # Verify Ollama models
    if ! verify_ollama_models; then
        echo -e "${RED}💥 Startup failed: Ollama models not available${NC}"
        exit 1
    fi
    
    # Wait for ChromaDB with API check
    if ! wait_for_service "ChromaDB" $CHROMA_PORT 20 "curl -s http://localhost:$CHROMA_PORT/api/v1/heartbeat"; then
        echo -e "${RED}💥 Startup failed: ChromaDB not ready${NC}"
        exit 1
    fi
    
    # Wait for Backend with health endpoint check
    if ! wait_for_service "Backend" $BACKEND_PORT 30 "curl -s http://localhost:$BACKEND_PORT/api/health"; then
        echo -e "${RED}💥 Startup failed: Backend not ready${NC}"
        exit 1
    fi
    
    # Final comprehensive health check
    echo ""
    echo -e "${BLUE}🩺 Running comprehensive health check...${NC}"
    
    # Test all critical endpoints
    local health_checks=(
        "http://localhost:$OLLAMA_PORT/api/tags|Ollama API"
        "http://localhost:$CHROMA_PORT/api/v1/heartbeat|ChromaDB API" 
        "http://localhost:$BACKEND_PORT/api/health|Backend Health"
        "http://localhost:$BACKEND_PORT/api/llm-status|LLM Router Status"
    )
    
    local failed_checks=0
    for check in "${health_checks[@]}"; do
        local url=$(echo "$check" | cut -d'|' -f1)
        local name=$(echo "$check" | cut -d'|' -f2)
        
        if curl -s --max-time 5 "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}   ✅ $name${NC}"
        else
            echo -e "${RED}   ❌ $name${NC}"
            ((failed_checks++))
        fi
    done
    
    echo ""
    if [ $failed_checks -eq 0 ]; then
        echo -e "${GREEN}🎉 All systems are healthy and ready!${NC}"
        echo ""
        echo -e "${BLUE}🔗 Service URLs:${NC}"
        echo -e "   • Frontend: http://localhost:3000"
        echo -e "   • Backend API: http://localhost:$BACKEND_PORT/api"
        echo -e "   • Backend Health: http://localhost:$BACKEND_PORT/api/health"
        echo -e "   • LLM Router Status: http://localhost:$BACKEND_PORT/api/llm-status"
        echo -e "   • Ollama API: http://localhost:$OLLAMA_PORT/api"
        echo -e "   • ChromaDB API: http://localhost:$CHROMA_PORT/api"
        echo ""
        echo -e "${GREEN}✨ EM-Taskflow is ready for use!${NC}"
        return 0
    else
        echo -e "${RED}💥 $failed_checks health check(s) failed${NC}"
        echo -e "${YELLOW}Check the logs for more details:${NC}"
        echo -e "   • Backend: $SCRIPT_DIR/backend.log"
        echo -e "   • Ollama: $SCRIPT_DIR/ollama.log"
        echo -e "   • ChromaDB: $SCRIPT_DIR/chroma.log"
        return 1
    fi
}

# Trap to handle interrupts gracefully
trap 'echo -e "\n${YELLOW}🛑 Startup interrupted. You may need to stop services manually.${NC}"; exit 1' INT TERM

# Run enhanced startup
enhanced_startup
