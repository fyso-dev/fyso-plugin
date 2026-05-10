#!/bin/bash
# Fyso Team Sync — Heartbeat: periodic activity summary
# Started by SessionStart hook, runs in background every 5 minutes.
# Per-tick logic lives in heartbeat_tick.py (sharing
# hooks/lib/tracking_common.py with tracking_event.py).

CONFIG="$HOME/.fyso/config.json"
[ ! -f "$CONFIG" ] && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PRICING_FILE="$SCRIPT_DIR/../opencode-plugin/src/pricing.json"

# Read session info from stdin (SessionStart JSON)
STDIN_DATA=$(cat 2>/dev/null || true)

SESSION_ID=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()).get('session_id',''))" 2>/dev/null)
TRANSCRIPT=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()).get('transcript_path',''))" 2>/dev/null)
CWD=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()).get('cwd',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0
[ -z "$TRANSCRIPT" ] && exit 0

export SESSION_ID TRANSCRIPT CWD

# Write PID file so Stop hook can kill us
PIDFILE="$HOME/.fyso/heartbeat.pid"
echo $$ > "$PIDFILE"

# Heartbeat loop
while true; do
  sleep 300  # 5 minutes

  # Check if transcript still exists (session alive)
  [ ! -f "$TRANSCRIPT" ] && break

  python3 "$SCRIPT_DIR/heartbeat_tick.py"
done

# Cleanup
rm -f "$PIDFILE" 2>/dev/null
