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


def _read_lines(transcript_path):
    try:
        with open(transcript_path) as f:
            return [ln.strip() for ln in f]
    except Exception:
        return None


def _process_transcript(lines):
    """Walk the transcript once, accumulating totals on `state` and recent-window
    summary on `summary_state`. Returns (state, summary_state)."""
    state = tc.transcript_state()
    summary_state = tc.transcript_state()
    recent_start = max(0, len(lines) - _RECENT_WINDOW)
    for idx, line in enumerate(lines):
        if not line:
            continue
        msg = tc.parse_transcript_message(line)
        if msg is None:
            continue
        tc.accumulate_usage(msg, state)
        if idx >= recent_start:
            tc.accumulate_usage(msg, summary_state)
            tc.collect_summary(
                msg,
                summary_state,
                recent_tools_window=3,
                min_text_len=5,
                text_truncate=100,
            )
    return state, summary_state


def _build_detail(summary_state):
    parts = []
    tools_used = summary_state["tools_used"]
    last_text = summary_state["last_text"]
    if tools_used:
        parts.append(", ".join(tools_used[-5:]))
    if last_text:
        parts.append(last_text.split("\n")[0][:80])
    detail = " | ".join(parts) if parts else "idle"
    return detail[:200]


def _build_payload(*, detail, team_name, user, session_id, model, family,
                   totals, cost, cwd):
    total_in, total_out, total_cw, total_cr, total = totals
    return tc.strip_none({
        "event": "heartbeat",
        "detail": detail,
        "team_name": team_name or None,
        "user": user,
        "session_id": session_id or None,
        "model": model or None,
        "model_family": family or None,
        "tokens": total if total > 0 else None,
        "input_tokens": total_in if total_in > 0 else None,
        "output_tokens": total_out if total_out > 0 else None,
        "cache_creation_tokens": total_cw if total_cw > 0 else None,
        "cache_read_tokens": total_cr if total_cr > 0 else None,
        "cost_usd": round(cost, 6) if cost > 0 else None,
        "cwd": cwd or None,
        "timestamp": tc.utc_now_iso(),
    })


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

    lines = _read_lines(transcript_path)
    if lines is None:
        return

    pricing, default_family = tc.load_pricing()
    state, summary_state = _process_transcript(lines)

    total_in = state["input"]
    total_out = state["output"]
    total_cw = state["cache_creation"]
    total_cr = state["cache_read"]
    total = tc.total_tokens(total_in, total_out, total_cw, total_cr)

    model = state["model"] or tc.DEFAULT_MODEL_FALLBACK
    family = tc.infer_model_family(model, default_family)
    cost = tc.calculate_cost(family, pricing, total_in, total_out, total_cw, total_cr)

    data = _build_payload(
        detail=_build_detail(summary_state),
        team_name=team_name,
        user=config.get("user_email", "") or os.environ.get("USER", ""),
        session_id=session_id,
        model=model,
        family=family,
        totals=(total_in, total_out, total_cw, total_cr, total),
        cost=cost,
        cwd=cwd,
    )

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
