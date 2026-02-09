#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VOLUME_FLAG=()
if [[ "${1:-}" == "--volumes" ]]; then
  VOLUME_FLAG=(-v)
fi

echo "Stopping EM TaskFlow services..."
docker compose down "${VOLUME_FLAG[@]}"

echo "Services stopped."
