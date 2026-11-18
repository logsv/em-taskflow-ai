#!/usr/bin/env bash
# Verification gate shared by humans, the git pre-push hook, and AI agents (/verify skill).
#
# Usage:
#   scripts/verify.sh            # run suites for areas changed vs origin/main (plus uncommitted changes)
#   scripts/verify.sh --all      # run every suite
#   scripts/verify.sh backend    # run named suites: backend | python | frontend (any combination)
#
# Exit code is non-zero if any suite fails. Prints a one-line summary per suite.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${VERIFY_LOG_DIR:-${TMPDIR:-/tmp}/em-taskflow-verify}"
mkdir -p "$LOG_DIR"

run_backend=0; run_python=0; run_frontend=0

if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    case "$arg" in
      --all) run_backend=1; run_python=1; run_frontend=1 ;;
      backend) run_backend=1 ;;
      python) run_python=1 ;;
      frontend) run_frontend=1 ;;
      *) echo "Unknown argument: $arg" >&2; exit 2 ;;
    esac
  done
else
  base="$(git -C "$ROOT" merge-base HEAD origin/main 2>/dev/null || echo HEAD)"
  changed="$( { git -C "$ROOT" diff --name-only "$base"; git -C "$ROOT" diff --name-only; git -C "$ROOT" ls-files --others --exclude-standard; } | sort -u)"
  grep -qE '^backend/' <<<"$changed" && run_backend=1
  grep -qE '^(services/python-ai-service/|proto/)' <<<"$changed" && run_python=1
  grep -qE '^frontend/' <<<"$changed" && run_frontend=1
  if [[ $run_backend$run_python$run_frontend == 000 ]]; then
    echo "verify: no backend/, services/python-ai-service/, proto/ or frontend/ changes — nothing to run (use --all to force)."
    exit 0
  fi
fi

status=0
summary=()

if [[ $run_backend == 1 ]]; then
  log="$LOG_DIR/backend.log"
  echo "▶ backend: npm test (log: $log)"
  if (cd "$ROOT/backend" && npm test >"$log" 2>&1); then
    summary+=("✅ backend   $(grep -Eo '[0-9]+ specs?, [0-9]+ failures?' "$log" | tail -1)")
  else
    summary+=("❌ backend   $(grep -Eo '[0-9]+ specs?, [0-9]+ failures?' "$log" | tail -1 || true) — see $log")
    status=1
  fi
fi

if [[ $run_python == 1 ]]; then
  log="$LOG_DIR/python.log"
  echo "▶ python: uv run pytest (log: $log)"
  if (cd "$ROOT/services/python-ai-service" && uv run pytest -q >"$log" 2>&1); then
    summary+=("✅ python    $(tail -1 "$log")")
  else
    summary+=("❌ python    $(tail -1 "$log") — see $log")
    status=1
  fi
fi

if [[ $run_frontend == 1 ]]; then
  log="$LOG_DIR/frontend.log"
  echo "▶ frontend: npm run build (log: $log)"
  if (cd "$ROOT/frontend" && npm run build >"$log" 2>&1); then
    summary+=("✅ frontend  vite build ok")
  else
    summary+=("❌ frontend  vite build failed — see $log")
    status=1
  fi
fi

echo
printf '%s\n' "${summary[@]}"
exit $status
