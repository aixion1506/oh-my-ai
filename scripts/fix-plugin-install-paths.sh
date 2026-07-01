#!/usr/bin/env bash
# ~/.claude/plugins/installed_plugins.json 의 installPath가 실제 $HOME과
# 다른 환경(devcontainer 등)의 절대경로로 잘못 기록되는 문제를 진단·교정한다.
# 실제 플러그인 파일은 로컬 캐시에 존재하는데 기록된 경로만 어긋나 skill/MCP가
# 로드되지 않는 케이스를 대상으로 한다.
set -euo pipefail

PLUGINS_JSON="$HOME/.claude/plugins/installed_plugins.json"
CACHE_ROOT="$HOME/.claude/plugins/cache"

if [ ! -f "$PLUGINS_JSON" ]; then
  echo "설치된 플러그인 상태 파일을 찾을 수 없음: $PLUGINS_JSON" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq가 필요합니다." >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cp "$PLUGINS_JSON" "$TMP"

found_broken=0
changed=0

while IFS=$'\t' read -r plugin idx install_path; do
  [ -e "$install_path" ] && continue
  found_broken=1

  suffix="${install_path#*/plugins/cache/}"
  candidate="$CACHE_ROOT/$suffix"

  if [ "$suffix" = "$install_path" ] || [ ! -e "$candidate" ]; then
    echo "[WARN] $plugin: installPath 없음 ($install_path) — 대체 경로도 못 찾음, 수동 확인 필요"
    continue
  fi

  jq --arg plugin "$plugin" --argjson idx "$idx" --arg newPath "$candidate" \
    '.plugins[$plugin][$idx].installPath = $newPath' "$TMP" > "$TMP.next"
  mv "$TMP.next" "$TMP"
  echo "[FIXED] $plugin: $install_path -> $candidate"
  changed=1
done < <(jq -r '
  .plugins
  | to_entries[]
  | .key as $plugin
  | .value
  | to_entries[]
  | [$plugin, .key, .value.installPath] | @tsv
' "$PLUGINS_JSON")

if [ "$found_broken" -eq 0 ]; then
  echo "모든 installPath 정상 — 수정 없음."
  exit 0
fi

if [ "$changed" -eq 0 ]; then
  echo "깨진 installPath를 찾았지만 자동 교정할 대체 경로가 없음 — 위 WARN 항목을 수동 확인하세요."
  exit 1
fi

backup="$PLUGINS_JSON.bak.$(date +%Y%m%d%H%M%S)"
cp "$PLUGINS_JSON" "$backup"
cp "$TMP" "$PLUGINS_JSON"
echo "백업: $backup"
echo "고친 항목이 있으니 Claude Code에서 /reload-plugins 를 실행하세요."
