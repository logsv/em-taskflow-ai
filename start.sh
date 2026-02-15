#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROFILE_ARGS=()
if [[ "${1:-}" == "--gpu" ]]; then
  PROFILE_ARGS=(--profile gpu)
fi

echo "Starting EM TaskFlow with Docker Compose..."
echo "Working directory: $SCRIPT_DIR"
if [[ "${#PROFILE_ARGS[@]}" -gt 0 ]]; then
  echo "Mode: GPU (includes vLLM)"
else
  echo "Mode: default (gemini + postgres + chroma + app)"
fi

docker compose "${PROFILE_ARGS[@]}" up -d --build

echo
echo "Services started."
echo "Frontend: http://localhost:3000"
echo "Backend health: http://localhost:4000/api/health"
echo
echo "Follow logs:"
echo "  docker compose logs -f backend frontend"
echo
echo "Stop:"
echo "  ./stop.sh"
