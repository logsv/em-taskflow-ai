#!/bin/bash

# Quick Stop Script for EM-Taskflow RAG+MCP+Agent System
# Simply runs the main management script with stop command

echo "🛑 Stopping EM-Taskflow RAG+MCP+Agent System..."
echo ""

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the main management script
"$SCRIPT_DIR/manage-services.sh" stop
