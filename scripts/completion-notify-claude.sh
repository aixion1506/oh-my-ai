#!/usr/bin/env bash
set -u
BASE="${OH_MY_AI_NOTIFY_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-ai/notifications}"
command -v python3 >/dev/null 2>&1 || exit 0
payload="$(cat 2>/dev/null || true)"
event="$(python3 - "$payload" <<'PY'
import json, sys
try: source=json.loads(sys.argv[1])
except Exception: raise SystemExit(0)
if not isinstance(source, dict): raise SystemExit(0)
# Claude completion events intentionally project no assistant response fields.
print(json.dumps({"type":"agent-turn-complete","runtime":"claude","cwd":source.get("cwd")}))
PY
)"
[ -n "$event" ] && "$BASE/dispatcher" "$event" || true
exit 0
