#!/bin/bash
# Triggers sync-reference.ts when an Edit/Write tool touched
# skills/<area>/reference/*.md.
#
# Reads the hook payload as JSON from stdin and parses it with python so
# tool-input content is never interpolated into a shell command. The
# previous inline hook used `echo "$CLAUDE_TOOL_INPUT"`, which exposed
# the command to attacker-controlled $(...) / backtick expansion when
# the hook framework substituted the placeholder before invoking bash.

set -u

INPUT="$(cat)"

FILE_PATH="$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = data.get("tool_input") if isinstance(data, dict) else None
if not isinstance(ti, dict):
    sys.exit(0)
fp = ti.get("file_path", "")
if isinstance(fp, str):
    sys.stdout.write(fp)
' 2>/dev/null)"

case "$FILE_PATH" in
  *skills/*/reference/*.md)
    bun "${CLAUDE_PLUGIN_ROOT}/bin/sync-reference.ts" 2>/dev/null
    ;;
esac

exit 0
