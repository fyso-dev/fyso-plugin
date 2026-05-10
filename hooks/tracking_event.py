"""Tracking event handler invoked by hooks/tracking.sh.

Reads the hook JSON from $TMPFILE and POSTs a tracking record to the Fyso API.
Handles: session_start, session_end, session_update, agent_dispatch,
subagent_start, subagent_stop.
"""

import datetime
import getpass
import hashlib
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
from lib import tracking_common as tc  # noqa: E402


def _read_hook_json():
    tmpfile = os.environ.get("TMPFILE", "")
    if not tmpfile or not os.path.exists(tmpfile):
        return {}
    try:
        with open(tmpfile) as f:
            content = f.read().strip()
        return json.loads(content) if content else {}
    except Exception:
        return {}
    finally:
        try:
            os.unlink(tmpfile)
        except Exception:
            pass


def _per_event_tokens(tool_response):
    input_tokens = output_tokens = cache_creation = cache_read = 0
    if isinstance(tool_response, dict):
        usage = tool_response.get("usage", {})
        if isinstance(usage, dict):
            input_tokens = usage.get("input_tokens", 0) or 0
            output_tokens = usage.get("output_tokens", 0) or 0
            cache_creation = usage.get("cache_creation_input_tokens", 0) or 0
            cache_read = usage.get("cache_read_input_tokens", 0) or 0
        if not (input_tokens or output_tokens):
            total = tool_response.get("totalTokens", 0) or 0
            if total:
                output_tokens = total
    return input_tokens, output_tokens, cache_creation, cache_read


def _session_id(hook):
    sid = hook.get("session_id", "")
    if sid:
        return sid
    key = f"{os.getppid()}-{datetime.date.today().isoformat()}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _detail(event_type, tool_input, state):
    if event_type == "session_start":
        return "session start"
    if event_type in ("session_end", "session_update"):
        last_text = state.get("last_text", "")
        tools_used = state.get("tools_used", [])
        if last_text:
            return last_text.split("\n")[0][:120]
        if tools_used:
            return "Used: " + ", ".join(tools_used[-5:])
        return "session update"
    detail = ""
    if isinstance(tool_input, dict):
        detail = tool_input.get("description", "") or tool_input.get("prompt", "")
        if isinstance(detail, str) and len(detail) > 200:
            detail = detail[:200] + "..."
    return detail


def main():
    config = tc.load_config()
    if not config or not config.get("token") or not config.get("tenant_id"):
        return

    _, default_family = tc.load_pricing()

    hook = _read_hook_json()
    event_type = os.environ.get("EVENT_TYPE", "session")
    hook_cwd = hook.get("cwd", os.getcwd())
    team_name = tc.resolve_team_name(hook_cwd)

    session_id = _session_id(hook)
    tool_name = hook.get("tool_name", "")
    tool_input = hook.get("tool_input", {}) or {}
    tool_response = hook.get("tool_response", {}) or {}

    agent = ""
    if isinstance(tool_input, dict):
        agent = tool_input.get("subagent_type", "") or tool_input.get("name", "") or ""

    input_tokens, output_tokens, cache_creation, cache_read = _per_event_tokens(tool_response)
    tokens = tc.total_tokens(input_tokens, output_tokens, cache_creation, cache_read)

    message_id = ""
    if isinstance(tool_response, dict):
        message_id = tool_response.get("id", "") or tool_response.get("requestId", "") or ""
    if not message_id:
        message_id = hook.get("requestId", "") or ""

    transcript_path = hook.get("transcript_path", "")
    state = tc.transcript_state()
    line_count = 0
    collect_summary = event_type in ("session_end", "session_update")

    if transcript_path and os.path.exists(transcript_path):
        try:
            with open(transcript_path, encoding="utf-8", errors="replace") as tf:
                for raw_line in tf:
                    line = raw_line.strip()
                    if not line:
                        continue
                    line_count += 1
                    tc.apply_transcript_line(
                        line,
                        state,
                        collect_summary=collect_summary,
                        recent_tools_window=5,
                        min_text_len=10,
                    )
            session_tokens = tc.total_tokens(
                state["input"], state["output"], state["cache_creation"], state["cache_read"]
            )
            tc.debug_log(
                f"TRANSCRIPT: path={transcript_path} lines={line_count} "
                f"usage_entries={state['usage_count']} model_entries={state['model_count']} "
                f"model={state['model']} session_tokens={session_tokens}"
            )
        except Exception as e:
            tc.debug_log(f"TRANSCRIPT_ERROR: {e}")

    model = state["model"] or tc.DEFAULT_MODEL_FALLBACK
    detail = _detail(event_type, tool_input, state)

    if event_type in ("session_end", "session_update"):
        tokens = 0
        input_tokens = 0
        output_tokens = 0
        cache_creation = 0
        cache_read = 0

    session_input = state["input"]
    session_output = state["output"]
    session_cache_creation = state["cache_creation"]
    session_cache_read = state["cache_read"]
    session_tokens = tc.total_tokens(
        session_input, session_output, session_cache_creation, session_cache_read
    )

    model_family = tc.infer_model_family(model, default_family)
    user = config.get("user_email", "") or getpass.getuser()

    data = tc.strip_none({
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
        "cache_creation_tokens": cache_creation,
        "cache_read_tokens": cache_read,
        "session_tokens": session_tokens,
        "session_input_tokens": session_input,
        "session_output_tokens": session_output,
        "session_cache_creation_tokens": session_cache_creation,
        "session_cache_read_tokens": session_cache_read,
        "cwd": hook.get("cwd", os.getcwd()) or None,
        "timestamp": tc.utc_now_iso(),
    })

    tc.debug_log(f"PAYLOAD: {json.dumps(data)}")

    try:
        status, body = tc.send_tracking_event(config, data)
        tc.debug_log(f"RESPONSE: {status} {body[:200]}\n")
    except Exception as e:
        tc.debug_log(f"ERROR: {e}\n")


if __name__ == "__main__":
    main()
