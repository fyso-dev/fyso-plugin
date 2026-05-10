"""Shared tracking helpers used by hooks/tracking_event.py and hooks/heartbeat_tick.py.

Single source of truth for: config loading, team resolution, transcript line
processing, model-family inference, pricing/cost calculation, debug logging,
and the HTTP request to the Fyso tracking endpoint.
"""

import datetime
import json
import os
import urllib.request

DEFAULT_FAMILY_FALLBACK = "opus"
DEFAULT_MODEL_FALLBACK = "claude-opus-4-6"


def load_config():
    path = os.path.expanduser("~/.fyso/config.json")
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def load_pricing(pricing_file=None):
    if pricing_file is None:
        pricing_file = os.environ.get("PRICING_FILE", "")
    pricing = {}
    default_family = DEFAULT_FAMILY_FALLBACK
    try:
        with open(pricing_file) as pf:
            data = json.load(pf)
        pricing = data.get("pricing", {}) or {}
        default_family = data.get("default_family", DEFAULT_FAMILY_FALLBACK) or DEFAULT_FAMILY_FALLBACK
    except Exception:
        pass
    return pricing, default_family


def resolve_team_name(cwd):
    if not cwd:
        return ""
    try:
        path = os.path.join(cwd, ".fyso", "team.json")
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f).get("team_name", "") or ""
    except Exception:
        pass
    return ""


def infer_model_family(model, default_family=DEFAULT_FAMILY_FALLBACK):
    if model:
        if "opus" in model:
            return "opus"
        if "sonnet" in model:
            return "sonnet"
        if "haiku" in model:
            return "haiku"
    return default_family


def total_tokens(input_tokens, output_tokens, cache_creation, cache_read):
    return input_tokens + output_tokens + cache_creation + cache_read


def calculate_cost(family, pricing, input_tokens, output_tokens, cache_creation, cache_read):
    p = pricing.get(family) if pricing else None
    if not p:
        return 0.0
    return (
        (input_tokens / 1e6) * p.get("input", 0)
        + (output_tokens / 1e6) * p.get("output", 0)
        + (cache_creation / 1e6) * p.get("cache_write", 0)
        + (cache_read / 1e6) * p.get("cache_read", 0)
    )


def transcript_state():
    """Fresh accumulator dict for transcript parsing."""
    return {
        "input": 0,
        "output": 0,
        "cache_creation": 0,
        "cache_read": 0,
        "model": "",
        "usage_count": 0,
        "model_count": 0,
        "tools_used": [],
        "last_text": "",
    }


def parse_transcript_message(line):
    """Return the `message` dict from a JSONL transcript line, or None."""
    if not line:
        return None
    try:
        entry = json.loads(line)
    except Exception:
        return None
    msg = entry.get("message", {})
    return msg if isinstance(msg, dict) else None


def accumulate_usage(msg, state):
    """Update token + model counters in `state` from a parsed message."""
    if not isinstance(msg, dict):
        return
    m = msg.get("model", "")
    if m:
        state["model"] = m
        state["model_count"] += 1

    u = msg.get("usage", {})
    if not isinstance(u, dict) or not u:
        return
    si = u.get("input_tokens", 0) or 0
    so = u.get("output_tokens", 0) or 0
    scw = u.get("cache_creation_input_tokens", 0) or 0
    scr = u.get("cache_read_input_tokens", 0) or 0
    if not (si or so or scw or scr):
        return
    state["usage_count"] += 1
    state["input"] += si
    state["output"] += so
    state["cache_creation"] += scw
    state["cache_read"] += scr


def _record_tool_use(c, state, recent_tools_window):
    name = c.get("name", "")
    if name and name not in state["tools_used"][-recent_tools_window:]:
        state["tools_used"].append(name)


def _record_assistant_text(c, msg, state, min_text_len, text_truncate):
    if msg.get("role") != "assistant":
        return
    t = c.get("text", "").strip()
    if not t or len(t) <= min_text_len:
        return
    state["last_text"] = t[:text_truncate] if text_truncate else t


def collect_summary(msg, state, recent_tools_window=3, min_text_len=5, text_truncate=None):
    """Collect recent tool names + latest assistant text from a parsed message."""
    if not isinstance(msg, dict):
        return
    content = msg.get("content", [])
    if not isinstance(content, list):
        return
    for c in content:
        if not isinstance(c, dict):
            continue
        ctype = c.get("type")
        if ctype == "tool_use":
            _record_tool_use(c, state, recent_tools_window)
        elif ctype == "text":
            _record_assistant_text(c, msg, state, min_text_len, text_truncate)


def is_debug_enabled():
    return os.path.exists(os.path.expanduser("~/.fyso/debug"))


def debug_log(message):
    if not is_debug_enabled():
        return
    log_path = os.path.expanduser("~/.fyso/hook-debug.log")
    try:
        with open(log_path, "a") as dl:
            dl.write(message)
            if not message.endswith("\n"):
                dl.write("\n")
    except Exception:
        pass


def utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat() + "Z"


def strip_none(payload):
    return {k: v for k, v in payload.items() if v is not None}


def send_tracking_event(config, payload, timeout=5):
    """POST payload to the Fyso tracking records endpoint. Returns (status, body).

    Raises on transport/HTTP failure — callers decide whether to swallow or log.
    """
    token = config.get("token", "")
    tenant = config.get("tenant_id", "")
    api_url = config.get("api_url", "https://api.fyso.dev")

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{api_url}/api/entities/tracking/records",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": tenant,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=timeout)
    return resp.status, resp.read().decode()
