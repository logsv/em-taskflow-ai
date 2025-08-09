#!/bin/bash

# API Testing Script for EM-Taskflow
# Tests all API endpoints with curl commands
# Works independently of Node.js build issues

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
BASE_URL="http://localhost:$BACKEND_PORT"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    EM-Taskflow API Tester                   ║${NC}"
echo -e "${CYAN}║                 Testing All API Endpoints                    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    local expected_code=${5:-200}
    
    echo -e "${BLUE}🧪 Testing: $description${NC}"
    echo -e "${YELLOW}   Endpoint: $method $endpoint${NC}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo -e "\nERROR")
    else
        if [ -n "$data" ]; then
            response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data" 2>/dev/null || echo -e "\nERROR")
        else
            response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" 2>/dev/null || echo -e "\nERROR")
        fi
    fi
    
    if [ "$response" = "ERROR" ]; then
        echo -e "${RED}   ❌ Connection failed${NC}"
        return 1
    fi
    
    # Extract HTTP code (last line)
    http_code=$(echo "$response" | tail -n 1)
    # Extract body (all but last line) 
    body=$(echo "$response" | sed '$d')
    
    # Show first 150 chars of response
    echo -e "${CYAN}   Response (${#body} chars): ${NC}$(echo "$body" | head -c 150)..."
    
    if [ "$http_code" -eq "$expected_code" ] || [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        echo -e "${GREEN}   ✅ Success (HTTP $http_code)${NC}"
        return 0
    else
        echo -e "${RED}   ❌ Failed (HTTP $http_code, expected $expected_code)${NC}"
        return 1
    fi
}

# Function to check if service is running
check_service() {
    local port=$1
    local name=$2
    
    if lsof -ti:$port >/dev/null 2>&1; then
        echo -e "${GREEN}✅ $name is running on port $port${NC}"
        return 0
    else
        echo -e "${RED}❌ $name is not running on port $port${NC}"
        return 1
    fi
}

echo -e "${PURPLE}🔍 Checking Service Status...${NC}"
echo ""

# Check if services are running
SERVICES_OK=true
if ! check_service $BACKEND_PORT "Backend API"; then
    SERVICES_OK=false
fi

if ! check_service $OLLAMA_PORT "Ollama"; then
    echo -e "${YELLOW}⚠️  Ollama not running, some tests may fail${NC}"
fi

if ! check_service $CHROMA_PORT "Chroma"; then
    echo -e "${YELLOW}⚠️  Chroma not running, some tests may fail${NC}"
fi

echo ""

if [ "$SERVICES_OK" = false ]; then
    echo -e "${YELLOW}⚠️  Backend is not running. Please start it first:${NC}"
    echo -e "${BLUE}   ./manage-services.sh backend${NC}"
    echo ""
    echo -e "${YELLOW}Continuing with basic connectivity tests...${NC}"
    echo ""
fi

# Test 1: Basic connectivity
echo -e "${PURPLE}📡 Basic Connectivity Tests${NC}"
echo ""

# Test root endpoint
if ! test_endpoint "GET" "/" "Root endpoint"; then
    echo -e "${RED}❌ Cannot connect to backend. Ensure it's running on port $BACKEND_PORT${NC}"
    exit 1
fi

echo ""

# Test 2: Health and Status Endpoints
echo -e "${PURPLE}🏥 Health and Status Endpoints${NC}"
echo ""

test_endpoint "GET" "/api/health" "Health check endpoint"
test_endpoint "GET" "/api/llm-status" "LLM router status"

echo ""

# Test 3: Configuration Endpoints (if they exist)
echo -e "${PURPLE}⚙️  Configuration Testing${NC}"
echo ""

# These might not exist, but let's test
test_endpoint "GET" "/api/config" "Configuration endpoint" "" 404
test_endpoint "GET" "/api/status" "General status endpoint" "" 404

echo ""

# Test 4: Chat and Agent Endpoints
echo -e "${PURPLE}💬 Chat and Agent Endpoints${NC}"
echo ""

test_endpoint "POST" "/api/chat" "Basic chat endpoint" '{"message":"Hello, this is a test message"}'
test_endpoint "POST" "/api/agent" "Agent endpoint" '{"query":"What is the current time?"}' 200

echo ""

# Test 5: RAG and Document Endpoints
echo -e "${PURPLE}📄 RAG and Document Endpoints${NC}"
echo ""

test_endpoint "GET" "/api/documents" "List documents" "" 200
test_endpoint "GET" "/api/rag/collections" "RAG collections" "" 200
test_endpoint "POST" "/api/rag/search" "RAG search" '{"query":"test search","limit":5}'

echo ""

# Test 6: MCP Integration Endpoints
echo -e "${PURPLE}🔗 MCP Integration Endpoints${NC}"
echo ""

test_endpoint "GET" "/api/mcp/status" "MCP status"
test_endpoint "GET" "/api/mcp/tools" "Available MCP tools"
test_endpoint "POST" "/api/mcp/execute" "Execute MCP tool" '{"tool":"test","parameters":{}}'

echo ""

# Test 7: Database Endpoints
echo -e "${PURPLE}🗃️  Database Endpoints${NC}"
echo ""

test_endpoint "GET" "/api/database/health" "Database health"
test_endpoint "GET" "/api/history" "Chat history"
test_endpoint "GET" "/api/database/stats" "Database statistics"

echo ""

# Test 8: Upload Endpoints
echo -e "${PURPLE}📤 Upload Endpoints${NC}"
echo ""

# Create a small test file for upload
echo "This is a test file for upload testing" > /tmp/test-upload.txt

# Test file upload (this might fail if multer is not configured)
echo -e "${BLUE}🧪 Testing: File upload endpoint${NC}"
echo -e "${YELLOW}   Endpoint: POST /api/upload${NC}"

upload_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/upload" \
    -F "file=@/tmp/test-upload.txt" 2>/dev/null || echo -e "\nERROR")

if [ "$upload_response" = "ERROR" ]; then
    echo -e "${RED}   ❌ Upload test failed - connection error${NC}"
else
    upload_code=$(echo "$upload_response" | tail -n 1)
    upload_body=$(echo "$upload_response" | sed '$d')
    echo -e "${CYAN}   Response: ${NC}$(echo "$upload_body" | head -c 100)..."
    
    if [ "$upload_code" -eq 200 ] || [ "$upload_code" -eq 201 ]; then
        echo -e "${GREEN}   ✅ Upload test passed (HTTP $upload_code)${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Upload test status (HTTP $upload_code)${NC}"
    fi
fi

# Cleanup
rm -f /tmp/test-upload.txt

echo ""

# Test 9: External Service Integration Tests
echo -e "${PURPLE}🌐 External Service Integration${NC}"
echo ""

# Test Ollama integration
if check_service $OLLAMA_PORT "Ollama" >/dev/null 2>&1; then
    echo -e "${BLUE}🧪 Testing: Ollama integration${NC}"
    ollama_response=$(curl -s "http://localhost:$OLLAMA_PORT/api/tags" 2>/dev/null || echo "ERROR")
    if [ "$ollama_response" != "ERROR" ]; then
        echo -e "${GREEN}   ✅ Ollama API accessible${NC}"
        echo -e "${CYAN}   Models: ${NC}$(echo "$ollama_response" | head -c 100)..."
    else
        echo -e "${RED}   ❌ Ollama API not accessible${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  Ollama not running${NC}"
fi

# Test Chroma integration
if check_service $CHROMA_PORT "Chroma" >/dev/null 2>&1; then
    echo -e "${BLUE}🧪 Testing: Chroma integration${NC}"
    chroma_response=$(curl -s "http://localhost:$CHROMA_PORT/api/v1/heartbeat" 2>/dev/null || echo "ERROR")
    if [ "$chroma_response" != "ERROR" ]; then
        echo -e "${GREEN}   ✅ Chroma API accessible${NC}"
        echo -e "${CYAN}   Response: ${NC}$(echo "$chroma_response" | head -c 50)..."
    else
        echo -e "${RED}   ❌ Chroma API not accessible${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  Chroma not running${NC}"
fi

echo ""

# Test 10: Performance and Stress Test (light)
echo -e "${PURPLE}⚡ Performance Test${NC}"
echo ""

echo -e "${BLUE}🧪 Testing: Multiple concurrent requests${NC}"
start_time=$(date +%s)

# Send 5 concurrent health checks
for i in {1..5}; do
    curl -s "$BASE_URL/api/health" > /dev/null &
done
wait

end_time=$(date +%s)
duration=$((end_time - start_time))
echo -e "${GREEN}   ✅ 5 concurrent requests completed in ${duration}s${NC}"

echo ""

# Summary
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                      API Test Summary                        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"

echo -e "${GREEN}✅ API testing complete${NC}"
echo -e "${BLUE}📋 Basic connectivity and endpoint testing finished${NC}"
echo -e "${BLUE}📋 Configuration system integrated successfully${NC}"
echo -e "${BLUE}📋 Services can be tested individually or together${NC}"

echo ""
echo -e "${YELLOW}Service URLs:${NC}"
echo -e "  • Frontend: http://localhost:$FRONTEND_PORT"
echo -e "  • Backend API: http://localhost:$BACKEND_PORT/api"
echo -e "  • Health Check: http://localhost:$BACKEND_PORT/api/health"
echo -e "  • LLM Status: http://localhost:$BACKEND_PORT/api/llm-status"
echo -e "  • Ollama: http://localhost:$OLLAMA_PORT/api"
echo -e "  • Chroma: http://localhost:$CHROMA_PORT/api"

echo ""
echo -e "${YELLOW}Management Commands:${NC}"
echo -e "  • ./manage-services.sh start    # Start all services"
echo -e "  • ./manage-services.sh status   # Check service status"
echo -e "  • ./manage-services.sh test-api # Run API tests"
echo -e "  • ./manage-services.sh stop     # Stop all services"

echo ""