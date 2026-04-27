#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.aporb.cca.sync"
PLIST_SRC="$REPO_ROOT/infra/launchd/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/cca"
WRAPPER="$REPO_ROOT/scripts/run-sync.sh"

mkdir -p "$(dirname "$PLIST_DST")" "$LOG_DIR"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
[ -f .env.local ] && set -a && . ./.env.local && set +a
exec /opt/homebrew/bin/pnpm cca sync
EOF
chmod +x "$WRAPPER"

sed -e "s|__WRAPPER__|$WRAPPER|g" \
    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

launchctl unload "$PLIST_DST" >/dev/null 2>&1 || true
launchctl load "$PLIST_DST"
echo "✓ cca sync installed (every 3h). Logs at $LOG_DIR"
echo "  check with: launchctl list | grep $LABEL"
