#!/bin/bash
# ==============================================================================
# Setup Script for Mac mini macOS launchd Nightly Evaluation Daemon
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="${SCRIPT_DIR}/com.emtaskflow.nightly-eval.plist"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_DEST="${LAUNCH_AGENTS_DIR}/com.emtaskflow.nightly-eval.plist"

mkdir -p "${LAUNCH_AGENTS_DIR}"

if [ "$1" == "uninstall" ]; then
  echo "🛑 Unloading and removing com.emtaskflow.nightly-eval..."
  launchctl unload "${PLIST_DEST}" 2>/dev/null || true
  rm -f "${PLIST_DEST}"
  echo "✅ Daemon uninstalled successfully!"
  exit 0
fi

echo "🚀 Installing macOS LaunchAgent for Nightly Evaluation..."

# Unload existing if present
launchctl unload "${PLIST_DEST}" 2>/dev/null || true

# Copy plist
cp "${PLIST_SRC}" "${PLIST_DEST}"
chmod 644 "${PLIST_DEST}"

# Load daemon
launchctl load "${PLIST_DEST}"

echo "✅ Successfully loaded com.emtaskflow.nightly-eval into launchd!"
echo "📅 Schedule: Every night at 00:00 (Midnight) Local Time."
echo "📄 Logs: $(cd "${SCRIPT_DIR}/.." && pwd)/logs/nightly-eval.log"
echo "ℹ️  To test immediate execution: bash ${SCRIPT_DIR}/run-nightly-eval.sh"
echo "ℹ️  To uninstall daemon: bash ${SCRIPT_DIR}/setup-nightly-eval-daemon.sh uninstall"
