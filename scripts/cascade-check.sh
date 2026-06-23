#!/usr/bin/env bash
# cascade-check: 커스텀 산출물이 MINE.md에 등록됐는지 검사 (drift 방지)
# born-here 스킬 + 커맨드/스크립트/훅/에이전트가 MINE.md 에 있어야 한다.
# 통과: exit 0 / 미등록: 목록 출력 + exit 1.  (omai-commit 에서 OMAI_SKIP_CASCADE=1 로 우회)
set -uo pipefail

REPO=$(dirname "$(dirname "$(readlink -f ~/.claude/settings.json)")")
MINE="$REPO/MINE.md"
MISSING=()
reg() { grep -qF "$1" "$MINE"; }   # MINE.md 에 문자열 존재?

# born-here 스킬만 (vendored 외부 스킬은 source 태그 없음 → 제외)
for f in "$REPO"/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  grep -qE '^[[:space:]]*source:[[:space:]]*born-here' "$f" || continue
  name=$(basename "$(dirname "$f")")
  reg "$name" || MISSING+=("skill: $name")
done

# 스크립트/훅/에이전트 (vendored 없음 → 전부 내 것)
for f in "$REPO"/scripts/*.sh "$REPO"/claude/hooks/*.sh "$REPO"/claude/agents/*; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  reg "$name" || MISSING+=("$name")
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "✗ cascade drift — MINE.md 미등록:" >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  echo "→ MINE.md 에 등록 후 재시도 (의도적 WIP면 OMAI_SKIP_CASCADE=1)." >&2
  echo "  (라우팅 표 CLAUDE.md 에도 넣을지 함께 검토 — 이건 강제 아님)" >&2
  exit 1
fi
exit 0
