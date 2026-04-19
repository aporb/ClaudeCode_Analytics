#!/usr/bin/env bash
set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$CLAUDE_HOME/hooks"
cp "$REPO_ROOT/infra/hooks/cca-ping.sh" "$CLAUDE_HOME/hooks/cca-ping.sh"
chmod +x "$CLAUDE_HOME/hooks/cca-ping.sh"

SETTINGS="$CLAUDE_HOME/settings.json"
if [ ! -f "$SETTINGS" ]; then
  echo '{"hooks":{}}' > "$SETTINGS"
fi

TMP="$(mktemp)"
jq --arg script "$CLAUDE_HOME/hooks/cca-ping.sh" '
  .hooks //= {}
  | .hooks.SessionStart = (
      (.hooks.SessionStart // [])
      | map(select(.hooks[]?.command | test("cca-ping.sh") | not))
      + [{hooks: [{type: "command", command: ($script + " SessionStart")}]}]
    )
  | .hooks.SessionEnd = (
      (.hooks.SessionEnd // [])
      | map(select(.hooks[]?.command | test("cca-ping.sh") | not))
      + [{hooks: [{type: "command", command: ($script + " SessionEnd")}]}]
    )
  | .hooks.Stop = (
      (.hooks.Stop // [])
      | map(select(.hooks[]?.command | test("cca-ping.sh") | not))
      + [{hooks: [{type: "command", command: ($script + " Stop")}]}]
    )
' "$SETTINGS" > "$TMP"
mv "$TMP" "$SETTINGS"

echo "✓ installed cca-ping.sh and registered hooks in $SETTINGS"
