#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🚀 Ensuring uv is installed and Python services are running...${NC}"

if lsof -ti:8001 >/dev/null 2>&1 && lsof -ti:8002 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Python RAG services already running on ports 8001 and 8002${NC}"
    exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo -e "${RED}❌ Python 3 not found. Please install Python 3.8+ and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Python found: $(python3 --version)${NC}"

if ! command -v uv >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  uv not found. Installing uv from https://astral.sh/uv...${NC}"
    if command -v curl >/dev/null 2>&1; then
        curl -LsSf https://astral.sh/uv/install.sh | sh
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- https://astral.sh/uv/install.sh | sh
    else
        echo -e "${RED}❌ Neither curl nor wget is available to install uv.${NC}"
        exit 1
    fi

    if [ -d "$HOME/.cargo/bin" ]; then
        export PATH="$HOME/.cargo/bin:$PATH"
    fi
    if [ -d "$HOME/.local/bin" ]; then
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

if ! command -v uv >/dev/null 2>&1; then
    echo -e "${RED}❌ uv still not found after installation attempt. Please check your PATH and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ uv found: $(uv --version)${NC}"

if [ ! -d "$SCRIPT_DIR/python-services" ]; then
    echo -e "${RED}❌ python-services directory not found at $SCRIPT_DIR/python-services${NC}"
    exit 1
fi

if [ ! -x "$SCRIPT_DIR/python-services/start-services.sh" ]; then
    if [ -f "$SCRIPT_DIR/python-services/start-services.sh" ]; then
        chmod +x "$SCRIPT_DIR/python-services/start-services.sh"
    else
        echo -e "${RED}❌ start-services.sh not found in python-services directory${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}🐍 Starting Python RAG microservices with uv-managed environments...${NC}"
cd "$SCRIPT_DIR/python-services"
./start-services.sh

echo -e "${GREEN}✅ manage-start.sh completed. Python RAG microservices should now be running.${NC}"

