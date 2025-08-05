#!/bin/bash

# Ollama Server Starter Script for Unix/macOS
# Starts Ollama server with proper configuration for HTTP endpoint usage

set -e

# Default configuration
HOST="127.0.0.1"
PORT="11434"
DAEMON=false
PID_FILE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            HOST="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --daemon)
            DAEMON=true
            shift
            ;;
        --pid-file)
            PID_FILE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --host HOST     Host to bind to (default: 127.0.0.1)"
            echo "  --port PORT     Port to bind to (default: 11434)"
            echo "  --daemon        Run as daemon (background)"
            echo "  --pid-file FILE Write PID to file"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Add /usr/local/bin to PATH to find ollama
export PATH=$PATH:/usr/local/bin

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed. Please install it first:"
    echo "   curl -fsSL https://ollama.ai/install.sh | sh"
    exit 1
fi

# Set environment variables
export OLLAMA_ORIGINS="*"
export OLLAMA_HOST="$HOST:$PORT"

echo "🚀 Starting Ollama server on http://$HOST:$PORT"

if [ "$DAEMON" = true ]; then
    # Run in background
    ollama serve > /dev/null 2>&1 &
    OLLAMA_PID=$!
    
    # Write PID to file if specified
    if [ -n "$PID_FILE" ]; then
        echo $OLLAMA_PID > "$PID_FILE"
    fi
    
    # Wait for server to start
    echo "⏳ Waiting for server to start..."
    for i in {1..30}; do
        if curl -s "http://$HOST:$PORT/api/tags" > /dev/null 2>&1; then
            echo "✅ Ollama server started successfully (PID: $OLLAMA_PID)"
            echo "   Endpoint: http://$HOST:$PORT"
            if [ -n "$PID_FILE" ]; then
                echo "   PID file: $PID_FILE"
            fi
            echo "   To stop: kill $OLLAMA_PID"
            exit 0
        fi
        sleep 1
    done
    
    echo "❌ Failed to start Ollama server within timeout"
    kill $OLLAMA_PID 2>/dev/null || true
    exit 1
else
    # Run in foreground
    echo "Press Ctrl+C to stop"
    ollama serve
fi