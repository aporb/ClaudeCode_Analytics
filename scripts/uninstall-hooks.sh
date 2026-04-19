#!/usr/bin/env bash
set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
SETTINGS="$CLAUDE_HOME/settings.json"

if [ -f "$SETTINGS" ]; then
  TMP="$(mktemp)"
  jq '
    .hooks.SessionStart = ((.hooks.SessionStart // []) | map(select(.hooks[]?.command | test("cca-ping.sh") | not)))
    | .hooks.SessionEnd = ((.hooks.SessionEnd // []) | map(select(.hooks[]?.command | test("cca-ping.sh") | not)))
    | .hooks.Stop = ((.hooks.Stop // []) | map(select(.hooks[]?.command | test("cca-ping.sh") | not)))
  ' "$SETTINGS" > "$TMP"
  mv "$TMP" "$SETTINGS"
fi

rm -f "$CLAUDE_HOME/hooks/cca-ping.sh"
echo "✓ removed cca-ping.sh hook from $SETTINGS"
