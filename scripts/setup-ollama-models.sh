#!/usr/bin/env bash
# Set up local Ollama models for EM TaskFlow AI on the Mac mini (M4, 16 GB).
#
#   1. Pulls the models the app needs: qwen3:8b-q8_0 (chat) and nomic-embed-text (embeddings).
#   2. Removes every other local Ollama model (asks first; --yes skips the prompt).
#   3. Applies the 16 GB Ollama settings (macOS app: via launchctl).
#   4. Points backend/.env at the new chat model.
#   5. Smoke-tests tool calling on the new model.
#
# Nothing is deleted unless both required models pulled successfully.
#
# Usage:
#   scripts/setup-ollama-models.sh            # interactive
#   scripts/setup-ollama-models.sh --yes      # no confirmation prompt
#   scripts/setup-ollama-models.sh --dry-run  # show what would happen, change nothing

set -euo pipefail

CHAT_MODEL="${LLM_DEFAULT_MODEL:-qwen3:8b-q8_0}"
EMBED_MODEL="${RAG_EMBEDDING_MODEL:-nomic-embed-text}"
OLLAMA_URL="${OLLAMA_HOST_URL:-http://localhost:11434}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/backend/.env"

ASSUME_YES=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if $DRY_RUN; then echo "[dry-run] $*"; else "$@"; fi; }

# Normalise "name" to "name:latest" so `ollama list` names compare reliably.
normalise() { case "$1" in *:*) echo "$1" ;; *) echo "$1:latest" ;; esac; }

command -v ollama >/dev/null 2>&1 || die "ollama is not installed. Install it from https://ollama.com/download and re-run."
curl -fsS -m 5 "$OLLAMA_URL/api/tags" >/dev/null 2>&1 || die "Ollama is not responding at $OLLAMA_URL. Start the Ollama app (or 'ollama serve') and re-run."

KEEP_CHAT="$(normalise "$CHAT_MODEL")"
KEEP_EMBED="$(normalise "$EMBED_MODEL")"

# ---------------------------------------------------------------------------
# 1. Pull required models first
# ---------------------------------------------------------------------------
log "Pulling required models: $CHAT_MODEL (≈8.9 GB) and $EMBED_MODEL"
FREE_KB="$(df -k "$HOME" | awk 'NR==2 {print $4}')"
if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt $((12 * 1024 * 1024)) ]; then
  warn "Less than 12 GB free on the home volume. The pull may fail; old models are removed only after the pull succeeds."
fi
run ollama pull "$CHAT_MODEL" || die "Failed to pull $CHAT_MODEL. No models were removed."
run ollama pull "$EMBED_MODEL" || die "Failed to pull $EMBED_MODEL. No models were removed."

# ---------------------------------------------------------------------------
# 2. Remove every other local model
# ---------------------------------------------------------------------------
# Plain arrays and while-read only: macOS ships bash 3.2 (no mapfile, no associative arrays).
TO_REMOVE=()
while IFS= read -r m; do
  [ -z "$m" ] && continue
  nm="$(normalise "$m")"
  if [ "$nm" != "$KEEP_CHAT" ] && [ "$nm" != "$KEEP_EMBED" ]; then
    TO_REMOVE+=("$m")
  fi
done < <(ollama list | awk 'NR>1 && $1 != "" {print $1}')

if [ "${#TO_REMOVE[@]}" -eq 0 ]; then
  log "No other local models to remove."
else
  log "These local models are not needed by EM TaskFlow AI and will be removed:"
  for m in "${TO_REMOVE[@]}"; do echo "    - $m"; done
  if ! $ASSUME_YES && ! $DRY_RUN; then
    read -r -p "Remove them? [y/N] " answer
    case "$answer" in y|Y|yes|YES) ;; *) log "Skipped removal."; TO_REMOVE=() ;; esac
  fi
  for m in ${TO_REMOVE[@]+"${TO_REMOVE[@]}"}; do
    run ollama rm "$m" || warn "Could not remove $m"
  done
fi

# ---------------------------------------------------------------------------
# 3. Ollama settings for 16 GB unified memory
# ---------------------------------------------------------------------------
log "Applying Ollama settings for 16 GB (one request at a time, chat + embedding model loaded, q8 KV cache)"
OLLAMA_SETTINGS="OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0
OLLAMA_KEEP_ALIVE=30m
OLLAMA_CONTEXT_LENGTH=8192"
if [ "$(uname -s)" = "Darwin" ]; then
  while IFS='=' read -r k v; do
    run launchctl setenv "$k" "$v"
  done <<< "$OLLAMA_SETTINGS"
  log "Settings applied with launchctl. Quit and reopen the Ollama app for them to take effect."
  warn "launchctl settings do not survive a reboot. Re-run this script after restarting the Mac, or add them to a LaunchAgent."
else
  warn "Not macOS: export these before starting 'ollama serve':"
  while IFS= read -r kv; do echo "    export $kv"; done <<< "$OLLAMA_SETTINGS"
fi

# ---------------------------------------------------------------------------
# 4. Point backend/.env at the new model
# ---------------------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  if grep -q '^LLM_DEFAULT_MODEL=' "$ENV_FILE"; then
    run sed -i.bak "s|^LLM_DEFAULT_MODEL=.*|LLM_DEFAULT_MODEL=$CHAT_MODEL|" "$ENV_FILE"
  else
    $DRY_RUN && echo "[dry-run] append LLM_DEFAULT_MODEL=$CHAT_MODEL to $ENV_FILE" || echo "LLM_DEFAULT_MODEL=$CHAT_MODEL" >> "$ENV_FILE"
  fi
  log "backend/.env now uses LLM_DEFAULT_MODEL=$CHAT_MODEL (backup: backend/.env.bak)"
else
  warn "backend/.env not found. Copy backend/.env.example to backend/.env (it already uses $CHAT_MODEL)."
fi

# ---------------------------------------------------------------------------
# 5. Smoke test: model advertises tools and returns a tool call
# ---------------------------------------------------------------------------
if $DRY_RUN; then
  log "Dry run complete. Nothing was changed."
  exit 0
fi

log "Checking $CHAT_MODEL capabilities"
if ollama show "$CHAT_MODEL" | grep -qi 'tools'; then
  echo "    tools capability: yes"
else
  warn "$CHAT_MODEL does not list the 'tools' capability. Tool calling may not work."
fi

log "Smoke-testing a tool call (thinking off, temperature 0)"
RESPONSE="$(curl -fsS -m 180 "$OLLAMA_URL/api/chat" -d @- <<JSON || true
{
  "model": "$CHAT_MODEL",
  "stream": false,
  "think": false,
  "options": { "temperature": 0 },
  "messages": [{ "role": "user", "content": "What is our DORA lead time over the last 30 days?" }],
  "tools": [{
    "type": "function",
    "function": {
      "name": "calculate_dora_metrics",
      "description": "Calculates DORA metrics for the team",
      "parameters": {
        "type": "object",
        "properties": {
          "metric": { "type": "string", "enum": ["ALL", "LEAD_TIME", "DEPLOY_FREQ", "CFR", "MTTR"] },
          "time_window": { "type": "string", "enum": ["7d", "30d", "90d"] }
        },
        "required": ["metric", "time_window"]
      }
    }
  }]
}
JSON
)"
if echo "$RESPONSE" | grep -q '"calculate_dora_metrics"'; then
  echo "    tool call returned: $(echo "$RESPONSE" | grep -o '"arguments":{[^}]*}' | head -1)"
  log "Done. Restart the backend so it picks up the new model:  docker compose restart backend python-ai-service"
else
  warn "The model did not return the expected tool call. Response:"
  echo "$RESPONSE" | head -c 800; echo
  exit 1
fi
