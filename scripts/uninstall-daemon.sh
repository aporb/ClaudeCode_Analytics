#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aporb.cca.ingester"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
rm -f "$(cd "$(dirname "$0")" && pwd)/run-daemon.sh"
echo "✓ daemon uninstalled"
