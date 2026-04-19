#!/usr/bin/env bash
set -u
EVENT="${1:-unknown}"
PAYLOAD="$(cat -)"

SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // .sessionId // empty' 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="${CLAUDE_SESSION_ID:-}"
fi

if [ -n "$SESSION_ID" ]; then
  curl --silent --show-error --max-time 1 \
    -X POST http://localhost:9939/hook \
    -H 'content-type: application/json' \
    -d "$(jq -n --arg s "$SESSION_ID" --arg e "$EVENT" --arg t "$(date -u +%Y-%m-%dT%H:%M:%S%z)" \
      '{sessionId: $s, event: $e, timestamp: $t}')" \
    >/dev/null 2>&1 || true
fi

exit 0
