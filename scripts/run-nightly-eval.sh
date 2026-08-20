#!/bin/bash
# ==============================================================================
# EM TaskFlow AI — Scheduled Nightly Deep Benchmark Execution Script
# ==============================================================================
# Executes:
# 1. Ragas Multi-Metric Evaluation (Faithfulness, Recall, Precision)
# 2. TruLens RAG Triad Recording & Leaderboard Sync
# 3. Pairwise Arena Model Calibration
# 4. Langfuse Analytics Score Export
# 5. Generates Daily Trend Artifacts in reports/evaluations/
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOGS_DIR="${ROOT_DIR}/logs"
LOG_FILE="${LOGS_DIR}/nightly-eval.log"

mkdir -p "${LOGS_DIR}"
mkdir -p "${ROOT_DIR}/reports/evaluations"

echo "================================================================================" >> "${LOG_FILE}"
echo "🌙 [$(date '+%Y-%m-%d %H:%M:%S')] Starting EM TaskFlow AI Nightly Deep Benchmark" >> "${LOG_FILE}"
echo "================================================================================" >> "${LOG_FILE}"

# Check if local Ollama daemon is active
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "⚠️ [$(date '+%Y-%m-%d %H:%M:%S')] Ollama is not running on http://localhost:11434. Starting Ollama..." >> "${LOG_FILE}"
  if command -v ollama > /dev/null 2>&1; then
    ollama serve >> "${LOGS_DIR}/ollama-daemon.log" 2>&1 &
    sleep 3
  fi
fi

# Navigate to python-ai-service
cd "${ROOT_DIR}/services/python-ai-service"

# Execute Scheduled Deep Benchmark via Temporal / uv
if nc -z localhost 7233 2>/dev/null || nc -z temporal 7233 2>/dev/null; then
  echo "🚀 Triggering Scheduled Deep Benchmark on Temporal Cluster..." >> "${LOG_FILE}"
  uv run python evaluation/trigger_temporal_benchmark.py >> "${LOG_FILE}" 2>&1
elif command -v uv > /dev/null 2>&1; then
  echo "🚀 Running Scheduled Deep Benchmark directly via uv..." >> "${LOG_FILE}"
  uv run python evaluation/scheduled_deep_benchmark.py >> "${LOG_FILE}" 2>&1
else
  echo "🚀 Running Scheduled Deep Benchmark via python3..." >> "${LOG_FILE}"
  python3 evaluation/scheduled_deep_benchmark.py >> "${LOG_FILE}" 2>&1
fi

EXIT_CODE=$?
if [ ${EXIT_CODE} -eq 0 ]; then
  echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] Scheduled Deep Benchmark completed successfully!" >> "${LOG_FILE}"
else
  echo "❌ [$(date '+%Y-%m-%d %H:%M:%S')] Scheduled Deep Benchmark exited with code ${EXIT_CODE}" >> "${LOG_FILE}"
fi

exit ${EXIT_CODE}
