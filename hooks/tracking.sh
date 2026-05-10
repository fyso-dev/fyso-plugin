#!/bin/bash
# Fyso Team Sync — Usage tracking hook v2.0
# Reads hook data from stdin (JSON) and sends to Fyso API
# Supports: session_start, session_end, agent_dispatch, subagent_start, subagent_stop

CONFIG="$HOME/.fyso/config.json"
[ ! -f "$CONFIG" ] && exit 0

# Resolve shared pricing source of truth (sibling opencode-plugin/src/pricing.json)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRICING_FILE="$SCRIPT_DIR/../opencode-plugin/src/pricing.json"

# Read stdin to temp file (avoids quoting issues)
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

# Single python call: read config + parse stdin + build payload + send
export TMPFILE EVENT_TYPE PRICING_FILE FYSO_HOOKS_DIR="$SCRIPT_DIR"
python3 << 'PYEOF'
import json, re, datetime, os, sys, getpass, hashlib
try:
    import urllib.request
except:
    sys.exit(0)

# Import shared tracking library (PRICING + infer_model_family + transcript parser)
sys.path.insert(0, os.environ.get("FYSO_HOOKS_DIR", os.path.dirname(os.path.abspath(__file__))))
try:
    from _tracking_lib import load_pricing, infer_model_family, parse_transcript_usage
except Exception:
    sys.exit(0)

config_path = os.path.expanduser("~/.fyso/config.json")
try:
    with open(config_path) as f:
        cfg = json.load(f)
except:
    sys.exit(0)

token = cfg.get("token", "")
tenant = cfg.get("tenant_id", "")
api_url = cfg.get("api_url", "https://api.fyso.dev")
user_email = cfg.get("user_email", "")

if not token or not tenant:
    sys.exit(0)

# Load shared pricing source of truth (PRICING table + default_family)
_PRICING, DEFAULT_FAMILY = load_pricing()

# Read stdin JSON from temp file (once)
tmpfile = os.environ.get("TMPFILE", "")
hook = {}
if tmpfile and os.path.exists(tmpfile):
    try:
        with open(tmpfile) as f:
            content = f.read().strip()
        if content:
            hook = json.loads(content)
    except:
        pass
    finally:
        try:
            os.unlink(tmpfile)
        except:
            pass

# Team info from local .fyso/team.json (per project directory)
team_name = ""
hook_cwd = hook.get("cwd", os.getcwd())
try:
    team_path = os.path.join(hook_cwd, ".fyso", "team.json")
    if os.path.exists(team_path):
        with open(team_path) as tf:
            team_name = json.load(tf).get("team_name", "")
except:
    pass

event_type = os.environ.get("EVENT_TYPE", "session")

# Session ID
session_id = hook.get("session_id", "")
if not session_id:
    key = f"{os.getppid()}-{datetime.date.today().isoformat()}"
    session_id = hashlib.md5(key.encode()).hexdigest()[:12]

# Tool info
tool_name = hook.get("tool_name", "")
tool_input = hook.get("tool_input", {}) or {}
tool_response = hook.get("tool_response", {}) or {}

# Agent name from input
agent = ""
if isinstance(tool_input, dict):
    agent = tool_input.get("subagent_type", "") or tool_input.get("name", "") or ""

# Action detail from input description
detail = ""
if isinstance(tool_input, dict):
    detail = tool_input.get("description", "") or tool_input.get("prompt", "")
    if isinstance(detail, str) and len(detail) > 200:
        detail = detail[:200] + "..."
if event_type == "session_start":
    detail = "session start"

# Token breakdown: extract individual token types from tool_response
input_tokens = 0
output_tokens = 0
cache_creation_tokens = 0
cache_read_tokens = 0
model = ""
message_id = ""

if isinstance(tool_response, dict):
    usage = tool_response.get("usage", {})
    if isinstance(usage, dict):
        input_tokens = usage.get("input_tokens", 0) or 0
        output_tokens = usage.get("output_tokens", 0) or 0
        cache_creation_tokens = usage.get("cache_creation_input_tokens", 0) or 0
        cache_read_tokens = usage.get("cache_read_input_tokens", 0) or 0
    # Fallback to totalTokens if no breakdown
    if not (input_tokens or output_tokens):
        total = tool_response.get("totalTokens", 0) or 0
        if total:
            output_tokens = total  # conservative: attribute to output

tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens

# Message ID for deduplication
if isinstance(tool_response, dict):
    message_id = tool_response.get("id", "") or tool_response.get("requestId", "") or ""
if not message_id and isinstance(hook, dict):
    message_id = hook.get("requestId", "") or ""

# Single-pass transcript read: shared lib accumulates session usage and last-seen model.
transcript_path = hook.get("transcript_path", "")
_t = parse_transcript_usage(transcript_path)
session_input = _t["input"]
session_output = _t["output"]
session_cache_creation = _t["cache_creation"]
session_cache_read = _t["cache_read"]
session_tokens = session_input + session_output + session_cache_creation + session_cache_read
if _t["model"]:
    model = _t["model"]
_summary = ""
_last_text = ""
_tools_used = []

# Per-script summary pass (only for session_end/session_update) — distinct dedup
# window and length thresholds vs heartbeat.sh, kept inline by design.
if event_type in ("session_end", "session_update"):
    for raw_line in _t["lines"]:
        try:
            entry = json.loads(raw_line)
        except:
            continue
        msg = entry.get("message", {})
        if not isinstance(msg, dict):
            continue
        content = msg.get("content", [])
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict):
                    if c.get("type") == "tool_use":
                        name = c.get("name", "")
                        if name and name not in _tools_used[-5:]:
                            _tools_used.append(name)
                    if c.get("type") == "text" and msg.get("role") == "assistant":
                        t = c.get("text", "").strip()
                        if t and len(t) > 10:
                            _last_text = t

if transcript_path and os.path.exists(os.path.expanduser("~/.fyso/debug")):
    log_path = os.path.expanduser("~/.fyso/hook-debug.log")
    try:
        with open(log_path, "a") as dl:
            dl.write(f"TRANSCRIPT: path={transcript_path} lines={_t['line_count']} usage_entries={_t['usage_count']} model_entries={_t['model_count']} model={model} session_tokens={session_tokens}\n")
    except Exception:
        pass

# Fallback: default to opus (Claude Code default model)
if not model:
    model = "claude-opus-4-6"

# Build detail for session_end/session_update
if event_type in ("session_end", "session_update"):
    if _last_text:
        _summary = _last_text.split("\n")[0][:120]
    elif _tools_used:
        _summary = "Used: " + ", ".join(_tools_used[-5:])
    detail = _summary if _summary else "session update"
    # For session events, clear per-event tokens (session-level is what matters)
    tokens = 0
    input_tokens = 0
    output_tokens = 0
    cache_creation_tokens = 0
    cache_read_tokens = 0

# Model family (for business rule cost calculation server-side) — shared logic
model_family = infer_model_family(model, DEFAULT_FAMILY)

# User
user = user_email or getpass.getuser()

# Build payload
data = {
    "event": event_type,
    "tool": tool_name or None,
    "agent": agent or None,
    "detail": detail or None,
    "team_name": team_name or None,
    "user": user or None,
    "session_id": session_id or None,
    "model": model or None,
    "model_family": model_family or None,
    "message_id": message_id or None,
    "tokens": tokens,
    "input_tokens": input_tokens,
    "output_tokens": output_tokens,
    "cache_creation_tokens": cache_creation_tokens,
    "cache_read_tokens": cache_read_tokens,
    "session_tokens": session_tokens,
    "session_input_tokens": session_input,
    "session_output_tokens": session_output,
    "session_cache_creation_tokens": session_cache_creation,
    "session_cache_read_tokens": session_cache_read,
    "cwd": hook.get("cwd", os.getcwd()) or None,
    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
}
data = {k: v for k, v in data.items() if v is not None}
payload = json.dumps(data).encode()

# Debug: log payload
debug_path = os.path.expanduser("~/.fyso/debug")
if os.path.exists(debug_path):
    log_path = os.path.expanduser("~/.fyso/hook-debug.log")
    with open(log_path, "a") as dl:
        dl.write(f"PAYLOAD: {payload.decode()}\n")

# Send
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
    resp_body = resp.read().decode()
    if os.path.exists(debug_path):
        with open(log_path, "a") as dl:
            dl.write(f"RESPONSE: {resp.status} {resp_body[:200]}\n\n")
except Exception as e:
    if os.path.exists(debug_path):
        log_path = os.path.expanduser("~/.fyso/hook-debug.log")
        with open(log_path, "a") as dl:
            dl.write(f"ERROR: {e}\n\n")
PYEOF

# Cleanup
rm -f "$TMPFILE" 2>/dev/null
exit 0
