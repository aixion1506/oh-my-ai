#!/usr/bin/env bash
set -u
payload="${1:-}"
command -v python3 >/dev/null 2>&1 || exit 0
rendered="$(python3 - "$payload" <<'PY'
import json, os, re, sys
try: data=json.loads(sys.argv[1])
except Exception: raise SystemExit(0)
if data.get("type") != "agent-turn-complete": raise SystemExit(0)
cwd=data.get("cwd") if isinstance(data.get("cwd"), str) else ""
project=os.path.basename(cwd.rstrip("/"))
project=re.sub(r"[\x00-\x1f\x7f]+", " ", project)
project=re.sub(r"\s+", " ", project).strip()
if project in ("", ".", ".."):
    project="현재 프로젝트"
project=project[:60]
message=data.get("last-assistant-message") if isinstance(data.get("last-assistant-message"), str) else ""
line=next((x for x in message.splitlines() if x.strip()), "응답이 완료되었습니다.")
line=re.sub(r"^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)", "", line)
line=re.sub(r"[\x00-\x1f\x7f]+", " ", line)
line=re.sub(r"\s+", " ", line).strip()[:90] or "응답이 완료되었습니다."
runtime=data.get("runtime")
label="Claude" if runtime == "claude" else "Codex"
print(f"{label} Turn 완료 · {project}\t{line}")
PY
)"
[ -n "$rendered" ] || exit 0
title="${rendered%%$'\t'*}"
body="${rendered#*$'\t'}"
[ "$title" != "$body" ] || exit 0
[ "${OH_MY_AI_NOTIFY_RENDER_ONLY:-}" != "1" ] || { printf '%s\n%s\n' "$title" "$body"; exit 0; }
[ "$(uname -s)" = "Darwin" ] || exit 0
# Pass values as argv rather than embedding user-derived text in AppleScript.
osascript \
  -e 'on run argv' \
  -e 'display notification (item 1 of argv) with title (item 2 of argv)' \
  -e 'end run' \
  "$body" "$title" >/dev/null 2>&1 || true
exit 0
