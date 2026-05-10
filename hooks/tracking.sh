#!/bin/bash
# Fyso Team Sync — Usage tracking hook v2.0
# Reads hook data from stdin (JSON) and sends to Fyso API.
# Supports: session_start, session_end, session_update, agent_dispatch,
# subagent_start, subagent_stop. The actual logic lives in tracking_event.py
# (sharing hooks/lib/tracking_common.py with heartbeat.sh).

CONFIG="$HOME/.fyso/config.json"
[ ! -f "$CONFIG" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PRICING_FILE="$SCRIPT_DIR/../opencode-plugin/src/pricing.json"

# Read stdin to a temp file (avoids quoting issues across the python call)
TMPFILE=$(mktemp)
cat > "$TMPFILE" 2>/dev/null || true

EVENT_TYPE="${1:-session}"

# Debug: save raw stdin for inspection
if [ -f "$HOME/.fyso/debug" ]; then
  echo "=== $(date -u) === EVENT=$EVENT_TYPE ===" >> "$HOME/.fyso/hook-debug.log"
  cp "$TMPFILE" "$HOME/.fyso/last-hook-stdin-${EVENT_TYPE}.json" 2>/dev/null
  echo "TMPFILE=$TMPFILE size=$(wc -c < "$TMPFILE")" >> "$HOME/.fyso/hook-debug.log"
  echo "STDIN_CONTENT=$(cat "$TMPFILE")" >> "$HOME/.fyso/hook-debug.log"
fi

export TMPFILE EVENT_TYPE
python3 "$SCRIPT_DIR/tracking_event.py"

rm -f "$TMPFILE" 2>/dev/null
exit 0
