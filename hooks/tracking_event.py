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

_SUMMARY_EVENTS = ("session_end", "session_update")


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
    if event_type in _SUMMARY_EVENTS:
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


def _process_transcript(transcript_path, with_summary):
    """Read a transcript file and return (state, line_count). On error, returns
    a fresh state and 0, plus logs the error to the debug log."""
    state = tc.transcript_state()
    line_count = 0
    if not transcript_path or not os.path.exists(transcript_path):
        return state, line_count
    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as tf:
            for raw_line in tf:
                line = raw_line.strip()
                if not line:
                    continue
                line_count += 1
                msg = tc.parse_transcript_message(line)
                if msg is None:
                    continue
                tc.accumulate_usage(msg, state)
                if with_summary:
                    tc.collect_summary(msg, state, recent_tools_window=5, min_text_len=10)
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
    return state, line_count


def _message_id(hook, tool_response):
    if isinstance(tool_response, dict):
        mid = tool_response.get("id", "") or tool_response.get("requestId", "")
        if mid:
            return mid
    return hook.get("requestId", "") or ""


def _agent_name(tool_input):
    if not isinstance(tool_input, dict):
        return ""
    return tool_input.get("subagent_type", "") or tool_input.get("name", "") or ""


def _build_payload(*, event_type, tool_name, agent, detail, team_name, user, session_id,
                   model, model_family, message_id, per_event, session_totals, cwd):
    input_tokens, output_tokens, cache_creation, cache_read, tokens = per_event
    s_in, s_out, s_cw, s_cr, s_total = session_totals
    return tc.strip_none({
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
        "session_tokens": s_total,
        "session_input_tokens": s_in,
        "session_output_tokens": s_out,
        "session_cache_creation_tokens": s_cw,
        "session_cache_read_tokens": s_cr,
        "cwd": cwd or None,
        "timestamp": tc.utc_now_iso(),
    })


def main():
    config = tc.load_config()
    if not config or not config.get("token") or not config.get("tenant_id"):
        return

    _, default_family = tc.load_pricing()

    hook = _read_hook_json()
    event_type = os.environ.get("EVENT_TYPE", "session")
    hook_cwd = hook.get("cwd", os.getcwd())
    team_name = tc.resolve_team_name(hook_cwd)

    tool_name = hook.get("tool_name", "")
    tool_input = hook.get("tool_input", {}) or {}
    tool_response = hook.get("tool_response", {}) or {}

    in_t, out_t, cw_t, cr_t = _per_event_tokens(tool_response)
    if event_type in _SUMMARY_EVENTS:
        in_t = out_t = cw_t = cr_t = 0
    tokens = tc.total_tokens(in_t, out_t, cw_t, cr_t)

    state, _ = _process_transcript(
        hook.get("transcript_path", ""),
        with_summary=event_type in _SUMMARY_EVENTS,
    )

    model = state["model"] or tc.DEFAULT_MODEL_FALLBACK
    model_family = tc.infer_model_family(model, default_family)
    detail = _detail(event_type, tool_input, state)
    user = config.get("user_email", "") or getpass.getuser()

    s_in, s_out, s_cw, s_cr = (
        state["input"], state["output"], state["cache_creation"], state["cache_read"]
    )
    s_total = tc.total_tokens(s_in, s_out, s_cw, s_cr)

    data = _build_payload(
        event_type=event_type,
        tool_name=tool_name,
        agent=_agent_name(tool_input),
        detail=detail,
        team_name=team_name,
        user=user,
        session_id=_session_id(hook),
        model=model,
        model_family=model_family,
        message_id=_message_id(hook, tool_response),
        per_event=(in_t, out_t, cw_t, cr_t, tokens),
        session_totals=(s_in, s_out, s_cw, s_cr, s_total),
        cwd=hook.get("cwd", os.getcwd()),
    )

    tc.debug_log(f"PAYLOAD: {json.dumps(data)}")

    try:
        status, body = tc.send_tracking_event(config, data)
        tc.debug_log(f"RESPONSE: {status} {body[:200]}\n")
    except Exception as e:
        tc.debug_log(f"ERROR: {e}\n")


if __name__ == "__main__":
    main()
