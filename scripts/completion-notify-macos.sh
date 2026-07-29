#!/usr/bin/env bash
set -u
payload="${1:-}"
command -v python3 >/dev/null 2>&1 || exit 0
rendered="$(python3 - "$payload" <<'PY'
import json, os, re, sys
try: data=json.loads(sys.argv[1])
except Exception: raise SystemExit(0)
if not isinstance(data, dict) or data.get("type") != "agent-turn-complete": raise SystemExit(0)
cwd=data.get("cwd") if isinstance(data.get("cwd"), str) else ""
project=os.path.basename(cwd.rstrip("/"))
project=re.sub(r"[\x00-\x1f\x7f]+", " ", project)
project=re.sub(r"\s+", " ", project).strip()[:60]
if project in ("", ".", ".."):
    project="현재 프로젝트"
label="Claude" if data.get("runtime") == "claude" else "Codex"
print(f"{label} Turn 완료 · {project}\t응답이 완료되었습니다. 결과를 확인하세요.")
PY
)"
[ -n "$rendered" ] || exit 0
title="${rendered%%$'\t'*}"
body="${rendered#*$'\t'}"
[ "$title" != "$body" ] || exit 0
[ "${OH_MY_AI_NOTIFY_RENDER_ONLY:-}" != "1" ] || { printf '%s\n%s\n' "$title" "$body"; exit 0; }
[ "$(uname -s)" = "Darwin" ] || exit 0
osascript \
  -e 'on run argv' \
  -e 'display notification (item 1 of argv) with title (item 2 of argv)' \
  -e 'end run' \
  "$body" "$title" >/dev/null 2>&1 || true
exit 0
