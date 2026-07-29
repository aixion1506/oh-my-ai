#!/usr/bin/env bash
# Fail-open projection only: event delivery must never block an agent turn.
set -u
BASE="${OH_MY_AI_NOTIFY_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-ai/notifications}"
STATE="$BASE/state/completion-notify.json"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-ai"
mkdir -p "$LOG_DIR" 2>/dev/null || true
printf '%s dispatcher invoked\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$LOG_DIR/completion-notify.log" 2>/dev/null || true
payload="${1:-}"
provider="${OH_MY_AI_NOTIFY_MACOS_ADAPTER:-$BASE/adapters/macos}"
"$provider" "$payload" >/dev/null 2>&1 || true
if [ -f "$STATE" ] && command -v python3 >/dev/null 2>&1; then
  # Array argv is decoded by Python and launched in the background: no eval,
  # no shell re-interpretation, and a hung legacy provider cannot block Codex.
  python3 - "$STATE" "$payload" >>"$LOG_DIR/completion-notify.log" 2>&1 <<'PY' &
import json, subprocess, sys
try:
    command = json.load(open(sys.argv[1], encoding="utf-8")).get("previous_codex_notify")
    if isinstance(command, list) and command and all(isinstance(x, str) for x in command):
        subprocess.Popen(command + [sys.argv[2]], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
except Exception:
    pass
PY
fi
exit 0
