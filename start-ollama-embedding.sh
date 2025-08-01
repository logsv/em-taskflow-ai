#!/bin/bash

# Ollama Server Starter Script with Embedding Model Support
# Starts Ollama server and ensures both LLM and embedding models are available

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
HOST="127.0.0.1"
PORT="11434"
LLM_MODEL="mistral:latest"
EMBEDDING_MODEL="nomic-embed-text"

echo -e "${BLUE}🚀 Starting Ollama Server with Embedding Support${NC}"
echo -e "${BLUE}================================================${NC}"

# Function to check if Ollama is running
check_ollama_status() {
    if curl -s "http://${HOST}:${PORT}/api/tags" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to check if a model exists
check_model_exists() {
    local model_name="$1"
    if curl -s "http://${HOST}:${PORT}/api/tags" | grep -q "\"name\":\"${model_name}\""; then
        return 0
    else
        return 1
    fi
}

# Function to pull a model if it doesn't exist
ensure_model_available() {
    local model_name="$1"
    local model_type="$2"
    
    echo -e "${YELLOW}📦 Checking ${model_type} model: ${model_name}${NC}"
    
    if check_model_exists "$model_name"; then
        echo -e "${GREEN}✅ ${model_type} model '${model_name}' is available${NC}"
    else
        echo -e "${YELLOW}⬇️  Pulling ${model_type} model '${model_name}'...${NC}"
        ollama pull "$model_name"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Successfully pulled ${model_type} model '${model_name}'${NC}"
        else
            echo -e "${RED}❌ Failed to pull ${model_type} model '${model_name}'${NC}"
            exit 1
        fi
    fi
}

# Function to test embedding generation
test_embedding_generation() {
    echo -e "${YELLOW}🧪 Testing embedding generation...${NC}"
    
    local test_response=$(curl -s -X POST "http://${HOST}:${PORT}/api/embeddings" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"${EMBEDDING_MODEL}\", \"prompt\": \"test embedding\"}")
    
    if echo "$test_response" | grep -q "embedding"; then
        echo -e "${GREEN}✅ Embedding generation working correctly${NC}"
        return 0
    else
        echo -e "${RED}❌ Embedding generation failed${NC}"
        echo "Response: $test_response"
        return 1
    fi
}

# Function to test LLM generation
test_llm_generation() {
    echo -e "${YELLOW}🧪 Testing LLM generation...${NC}"
    
    local test_response=$(curl -s -X POST "http://${HOST}:${PORT}/api/generate" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"${LLM_MODEL}\", \"prompt\": \"Hello\", \"stream\": false}")
    
    if echo "$test_response" | grep -q "response"; then
        echo -e "${GREEN}✅ LLM generation working correctly${NC}"
        return 0
    else
        echo -e "${RED}❌ LLM generation failed${NC}"
        echo "Response: $test_response"
        return 1
    fi
}

# Main execution
echo -e "${BLUE}🔍 Checking Ollama server status...${NC}"

# Check if Ollama is already running
if check_ollama_status; then
    echo -e "${GREEN}✅ Ollama server is already running on ${HOST}:${PORT}${NC}"
else
    echo -e "${YELLOW}🚀 Starting Ollama server...${NC}"
    
    # Start Ollama server in background
    OLLAMA_HOST="${HOST}:${PORT}" ollama serve &
    OLLAMA_PID=$!
    
    # Wait for server to start
    echo -e "${YELLOW}⏳ Waiting for Ollama server to start...${NC}"
    for i in {1..30}; do
        if check_ollama_status; then
            echo -e "${GREEN}✅ Ollama server started successfully${NC}"
            break
        fi
        sleep 1
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ Failed to start Ollama server${NC}"
            exit 1
        fi
    done
fi

# Ensure required models are available
echo -e "${BLUE}📚 Ensuring required models are available...${NC}"
ensure_model_available "$LLM_MODEL" "LLM"
ensure_model_available "$EMBEDDING_MODEL" "Embedding"

# Test both services
echo -e "${BLUE}🧪 Testing services...${NC}"
test_llm_generation
test_embedding_generation

# Display final status
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}🎉 Ollama Server Ready for RAG+MCP+Agent Flow!${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}📍 Server URL: http://${HOST}:${PORT}${NC}"
echo -e "${GREEN}🤖 LLM Model: ${LLM_MODEL}${NC}"
echo -e "${GREEN}🔍 Embedding Model: ${EMBEDDING_MODEL}${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "${YELLOW}💡 Available API endpoints:${NC}"
echo -e "   • LLM Generation: POST /api/generate"
echo -e "   • Embeddings: POST /api/embeddings"
echo -e "   • Model List: GET /api/tags"
echo -e "${BLUE}================================================${NC}"

# Keep the script running if we started Ollama
if [ ! -z "$OLLAMA_PID" ]; then
    echo -e "${YELLOW}🔄 Ollama server running in background (PID: $OLLAMA_PID)${NC}"
    echo -e "${YELLOW}📝 Press Ctrl+C to stop the server${NC}"
    
    # Handle cleanup on exit
    trap "echo -e '${YELLOW}🛑 Stopping Ollama server...${NC}'; kill $OLLAMA_PID; exit 0" INT TERM
    
    # Wait for the background process
    wait $OLLAMA_PID
fi
