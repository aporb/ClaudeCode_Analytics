#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.aporb.cca.ingester"
PLIST_SRC="$REPO_ROOT/infra/launchd/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/cca"
WRAPPER="$REPO_ROOT/scripts/run-daemon.sh"

mkdir -p "$(dirname "$PLIST_DST")" "$LOG_DIR"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
[ -f .env.local ] && set -a && . ./.env.local && set +a
/opt/homebrew/bin/pnpm --filter @cca/ingester exec tsx src/cli.ts daemon
EOF
chmod +x "$WRAPPER"

sed -e "s|__WRAPPER__|$WRAPPER|" \
    -e "s|__REPO_ROOT__|$REPO_ROOT|" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" >/dev/null 2>&1 || true
launchctl load "$PLIST_DST"
echo "✓ daemon installed. Logs at $LOG_DIR"
echo "  check with: launchctl list | grep $LABEL"
echo "  and: curl http://localhost:9939/status"
