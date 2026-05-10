"""Heartbeat tick handler invoked once per iteration by hooks/heartbeat.sh.

Reads SESSION_ID/TRANSCRIPT/CWD from the environment, summarises recent
activity from the transcript, and POSTs a `heartbeat` tracking event.
"""

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
from lib import tracking_common as tc  # noqa: E402

_RECENT_WINDOW = 50


def main():
    config = tc.load_config()
    if not config:
        return
    token = config.get("token", "")
    tenant = config.get("tenant_id", "")
    transcript_path = os.environ.get("TRANSCRIPT", "")
    if not token or not tenant or not transcript_path:
        return

    cwd = os.environ.get("CWD", "")
    session_id = os.environ.get("SESSION_ID", "")
    team_name = tc.resolve_team_name(cwd or os.getcwd())

    try:
        with open(transcript_path) as f:
            lines = [ln.strip() for ln in f]
    except Exception:
        return

    pricing, default_family = tc.load_pricing()

    state = tc.transcript_state()
    summary_state = tc.transcript_state()

    recent_start = max(0, len(lines) - _RECENT_WINDOW)
    for idx, line in enumerate(lines):
        if not line:
            continue
        tc.apply_transcript_line(line, state)
        if idx >= recent_start:
            tc.apply_transcript_line(
                line,
                summary_state,
                collect_summary=True,
                recent_tools_window=3,
                min_text_len=5,
                text_truncate=100,
            )

    tools_used = summary_state["tools_used"]
    last_text = summary_state["last_text"]
    parts = []
    if tools_used:
        parts.append(", ".join(tools_used[-5:]))
    if last_text:
        parts.append(last_text.split("\n")[0][:80])
    detail = " | ".join(parts) if parts else "idle"
    if len(detail) > 200:
        detail = detail[:200]

    total_input = state["input"]
    total_output = state["output"]
    total_cache_creation = state["cache_creation"]
    total_cache_read = state["cache_read"]
    total = tc.total_tokens(total_input, total_output, total_cache_creation, total_cache_read)

    model = state["model"] or tc.DEFAULT_MODEL_FALLBACK
    family = tc.infer_model_family(model, default_family)
    cost = tc.calculate_cost(
        family, pricing, total_input, total_output, total_cache_creation, total_cache_read
    )

    user_email = config.get("user_email", "")

    data = tc.strip_none({
        "event": "heartbeat",
        "detail": detail,
        "team_name": team_name or None,
        "user": user_email or os.environ.get("USER", ""),
        "session_id": session_id or None,
        "model": model or None,
        "model_family": family or None,
        "tokens": total if total > 0 else None,
        "input_tokens": total_input if total_input > 0 else None,
        "output_tokens": total_output if total_output > 0 else None,
        "cache_creation_tokens": total_cache_creation if total_cache_creation > 0 else None,
        "cache_read_tokens": total_cache_read if total_cache_read > 0 else None,
        "cost_usd": round(cost, 6) if cost > 0 else None,
        "cwd": cwd or None,
        "timestamp": tc.utc_now_iso(),
    })

    if tc.is_debug_enabled():
        tc.debug_log(f"=== {tc.utc_now_iso()} === EVENT=heartbeat ===")
        tc.debug_log(
            f"TRANSCRIPT: path={transcript_path} lines={len(lines)} "
            f"model={model} session_tokens={total}"
        )
        tc.debug_log(f"PAYLOAD: {json.dumps(data)}")

    try:
        status, body = tc.send_tracking_event(config, data)
        tc.debug_log(f"RESPONSE: {status} {body[:200]}\n")
    except Exception as e:
        tc.debug_log(f"ERROR: {e}\n")


if __name__ == "__main__":
    main()
