#!/bin/bash
# Fyso Team Sync — Heartbeat: periodic activity summary
# Started by SessionStart hook, runs in background every 5 minutes
# Reads transcript, summarizes recent activity, sends as tracking event

CONFIG="$HOME/.fyso/config.json"
[ ! -f "$CONFIG" ] && exit 0

# Resolve shared pricing source of truth (sibling opencode-plugin/src/pricing.json)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PRICING_FILE="$SCRIPT_DIR/../opencode-plugin/src/pricing.json"
export FYSO_HOOKS_DIR="$SCRIPT_DIR"

# Read session info from stdin (SessionStart JSON)
STDIN_DATA=$(cat 2>/dev/null || true)

SESSION_ID=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()).get('session_id',''))" 2>/dev/null)
TRANSCRIPT=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()).get('transcript_path',''))" 2>/dev/null)
CWD=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip()).get('cwd',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0
[ -z "$TRANSCRIPT" ] && exit 0

# Write PID file so Stop hook can kill us
PIDFILE="$HOME/.fyso/heartbeat.pid"
echo $$ > "$PIDFILE"

# Heartbeat loop
while true; do
  sleep 300  # 5 minutes

  # Check if transcript still exists (session alive)
  [ ! -f "$TRANSCRIPT" ] && break

  python3 << 'PYEOF'
import json, os, sys, datetime

# Import shared tracking library (PRICING + infer_model_family + cost + transcript parser)
sys.path.insert(0, os.environ.get("FYSO_HOOKS_DIR", os.path.dirname(os.path.abspath(__file__))))
try:
    from _tracking_lib import load_pricing, infer_model_family, calculate_cost, parse_transcript_usage
except Exception:
    sys.exit(0)

config_path = os.path.expanduser("~/.fyso/config.json")
try:
    cfg = json.load(open(config_path))
except:
    sys.exit(0)

token = cfg.get("token", "")
tenant = cfg.get("tenant_id", "")
api_url = cfg.get("api_url", "https://api.fyso.dev")
team_name = ""
try:
    team_path = os.path.join(os.environ.get("CWD", os.getcwd()), ".fyso", "team.json")
    if os.path.exists(team_path):
        team_name = json.load(open(team_path)).get("team_name", "")
except:
    pass
user_email = cfg.get("user_email", "")
session_id = os.environ.get("SESSION_ID", "")
transcript = os.environ.get("TRANSCRIPT", "")
cwd = os.environ.get("CWD", "")

if not token or not tenant or not transcript:
    sys.exit(0)

# Single-pass transcript read: shared lib accumulates session usage and last-seen model.
_t = parse_transcript_usage(transcript)
lines = _t["lines"]
if not lines:
    sys.exit(0)

# Recent activity summary uses just the last 50 lines (smaller dedup window
# than tracking.sh's session_end summary — kept inline by design).
recent = lines[-50:] if len(lines) > 50 else lines
tools_used = []
last_text = ""
for line in recent:
    try:
        entry = json.loads(line)
        msg = entry.get("message", {})
        if not isinstance(msg, dict):
            continue
        content = msg.get("content", [])
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict):
                    if c.get("type") == "tool_use":
                        name = c.get("name", "")
                        if name and name not in tools_used[-3:]:
                            tools_used.append(name)
                    if c.get("type") == "text" and msg.get("role") == "assistant":
                        t = c.get("text", "").strip()
                        if t and len(t) > 5:
                            last_text = t[:100]
    except:
        continue

# Build short summary
parts = []
if tools_used:
    recent_tools = tools_used[-5:]
    parts.append(", ".join(recent_tools))
if last_text:
    summary = last_text.split("\n")[0][:80]
    parts.append(summary)

detail = " | ".join(parts) if parts else "idle"
if len(detail) > 200:
    detail = detail[:200]

# Token totals from shared accumulator
total_input = _t["input"]
total_output = _t["output"]
total_cache_creation = _t["cache_creation"]
total_cache_read = _t["cache_read"]
total_tokens = total_input + total_output + total_cache_creation + total_cache_read
model = _t["model"]

# Cost calculation — loaded from shared source of truth
PRICING, DEFAULT_FAMILY = load_pricing()

# Fallback: default to opus when transcript yields no model (parity with tracking.sh / tracking.ts)
if not model:
    model = "claude-opus-4-6"

model_family = infer_model_family(model, DEFAULT_FAMILY)
cost_usd = calculate_cost(model_family, total_input, total_output, total_cache_creation, total_cache_read, PRICING)

import urllib.request
data = {
    "event": "heartbeat",
    "detail": detail,
    "team_name": team_name or None,
    "user": user_email or os.environ.get("USER", ""),
    "session_id": session_id or None,
    "model": model or None,
    "model_family": model_family or None,
    "tokens": total_tokens if total_tokens > 0 else None,
    "input_tokens": total_input if total_input > 0 else None,
    "output_tokens": total_output if total_output > 0 else None,
    "cache_creation_tokens": total_cache_creation if total_cache_creation > 0 else None,
    "cache_read_tokens": total_cache_read if total_cache_read > 0 else None,
    "cost_usd": round(cost_usd, 6) if cost_usd > 0 else None,
    "cwd": cwd or None,
    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
}
data = {k: v for k, v in data.items() if v is not None}
payload = json.dumps(data).encode()

debug_path = os.path.expanduser("~/.fyso/debug")
log_path = os.path.expanduser("~/.fyso/hook-debug.log")
is_debug = os.path.exists(debug_path)

if is_debug:
    with open(log_path, "a") as dl:
        dl.write(f"=== {datetime.datetime.utcnow().isoformat()}Z === EVENT=heartbeat ===\n")
        dl.write(f"TRANSCRIPT: path={transcript} lines={len(lines)} model={model} session_tokens={total_tokens}\n")
        dl.write(f"PAYLOAD: {payload.decode()}\n")

try:
    req = urllib.request.Request(
        f"{api_url}/api/entities/tracking/records",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": tenant,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=5)
    if is_debug:
        resp_body = resp.read().decode()
        with open(log_path, "a") as dl:
            dl.write(f"RESPONSE: {resp.status} {resp_body[:200]}\n\n")
except Exception as e:
    if is_debug:
        with open(log_path, "a") as dl:
            dl.write(f"ERROR: {e}\n\n")
PYEOF

done

# Cleanup
rm -f "$PIDFILE" 2>/dev/null
