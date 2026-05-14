"""Shared logic for Fyso tracking hooks.

Single source of truth for:
- PRICING table + default model family (loaded from
  ../opencode-plugin/src/pricing.json so the bash hooks and the TS plugin
  agree on prices and the unknown-family fallback).
- infer_model_family(model)
- calculate_cost(family, ...)
- parse_transcript_usage(path) — JSONL session token accumulator.
- load_config() — reads ~/.fyso/config.json.
- filter_payload(dict) — drops None-valued keys.
- debug_enabled() / debug_log(msg) — ~/.fyso/debug flag + hook-debug.log.
- send_tracking_event(api_url, token, tenant, payload) — POST to records API.

The PRICING source-of-truth file can be overridden via the PRICING_FILE
environment variable; otherwise it resolves relative to this file.
"""

import json
import os


_DEFAULT_PRICING_PATH = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "opencode-plugin",
        "src",
        "pricing.json",
    )
)


def load_pricing(path=None):
    """Return ``(pricing_dict, default_family)``.

    Falls back to ``({}, "opus")`` if the file is missing or unreadable so
    callers can degrade gracefully instead of crashing the hook.
    """
    path = path or os.environ.get("PRICING_FILE") or _DEFAULT_PRICING_PATH
    try:
        with open(path) as f:
            data = json.load(f)
        return data.get("pricing", {}) or {}, data.get("default_family", "opus")
    except Exception:
        return {}, "opus"


def infer_model_family(model, default_family="opus"):
    """Return ``opus|sonnet|haiku`` based on substring match, else ``default_family``."""
    if not model:
        return default_family
    if "opus" in model:
        return "opus"
    if "sonnet" in model:
        return "sonnet"
    if "haiku" in model:
        return "haiku"
    return default_family


def calculate_cost(family, input_tokens, output_tokens, cache_write, cache_read, pricing):
    """Cost in USD for a single (family, usage) tuple. Returns 0 for unknown families."""
    p = pricing.get(family) if pricing else None
    if not p:
        return 0.0
    return (
        (input_tokens / 1e6) * p.get("input", 0)
        + (output_tokens / 1e6) * p.get("output", 0)
        + (cache_write / 1e6) * p.get("cache_write", 0)
        + (cache_read / 1e6) * p.get("cache_read", 0)
    )


def parse_transcript_usage(transcript_path, retain_lines=False):
    """Walk a Claude transcript JSONL once and accumulate session usage.

    Returns a dict with keys:
        model, input, output, cache_creation, cache_read,
        lines (list[str] — raw stripped JSONL lines, in order; only populated
            when ``retain_lines=True`` to avoid memory pressure on the
            high-frequency tracking path),
        line_count, usage_count, model_count

    Set ``retain_lines=True`` when the caller needs to run a second pass over
    the transcript (e.g. the heartbeat summary, or session_end detail). When
    False (the default) ``lines`` is left empty and the parser stays
    streaming.

    Returns the empty/zero shape on missing path or read errors so callers
    don't need to guard.
    """
    result = {
        "model": "",
        "input": 0,
        "output": 0,
        "cache_creation": 0,
        "cache_read": 0,
        "lines": [],
        "line_count": 0,
        "usage_count": 0,
        "model_count": 0,
    }
    if not transcript_path or not os.path.exists(transcript_path):
        return result
    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as tf:
            for raw_line in tf:
                stripped = raw_line.strip()
                if not stripped:
                    continue
                if retain_lines:
                    result["lines"].append(stripped)
                result["line_count"] += 1
                try:
                    entry = json.loads(stripped)
                except Exception:
                    continue
                msg = entry.get("message", {})
                if not isinstance(msg, dict):
                    continue
                m = msg.get("model", "")
                if m:
                    result["model"] = m
                    result["model_count"] += 1
                u = msg.get("usage", {})
                if isinstance(u, dict) and u:
                    si = u.get("input_tokens", 0) or 0
                    so = u.get("output_tokens", 0) or 0
                    scw = u.get("cache_creation_input_tokens", 0) or 0
                    scr = u.get("cache_read_input_tokens", 0) or 0
                    if si or so or scw or scr:
                        result["usage_count"] += 1
                        result["input"] += si
                        result["output"] += so
                        result["cache_creation"] += scw
                        result["cache_read"] += scr
    except Exception:
        pass
    return result


_DEBUG_FLAG_PATH = os.path.expanduser("~/.fyso/debug")
_DEBUG_LOG_PATH = os.path.expanduser("~/.fyso/hook-debug.log")
_CONFIG_PATH = os.path.expanduser("~/.fyso/config.json")
_TRACKING_ENDPOINT = "/api/entities/tracking/records"


def load_config(path=None):
    """Return parsed ``~/.fyso/config.json`` dict, or ``None`` on missing/invalid file."""
    try:
        with open(path or _CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return None


def filter_payload(data):
    """Drop keys whose value is ``None`` so the API receives only set fields."""
    return {k: v for k, v in data.items() if v is not None}


def debug_enabled():
    """Return True when the user has touched ``~/.fyso/debug``."""
    return os.path.exists(_DEBUG_FLAG_PATH)


def debug_log(message):
    """Append a line to ``~/.fyso/hook-debug.log`` iff debug is enabled.

    Best-effort: silently swallows errors so debug logging never breaks a hook.
    Caller is responsible for trailing newlines.
    """
    if not debug_enabled():
        return
    try:
        with open(_DEBUG_LOG_PATH, "a") as dl:
            dl.write(message)
    except Exception:
        pass


def send_tracking_event(api_url, token, tenant, payload, timeout=5):
    """POST ``payload`` (dict or bytes) to the tracking records endpoint.

    Returns ``(status_code, response_body_text)``. Raises on network/HTTP errors
    so the caller can decide whether to debug-log and swallow.
    """
    import urllib.request

    body = json.dumps(payload).encode() if isinstance(payload, dict) else payload
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}{_TRACKING_ENDPOINT}",
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
