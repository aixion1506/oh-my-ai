#!/usr/bin/env bash
# omai-commit: oh-my-ai 전용 커밋·푸시 (개인계정 aixion1506 자동 전환·복귀)
# 반복되던 4단계 수동(switch→add→commit→push→switch back)을 한 줄로.
# 사용: omai-commit "커밋 메시지" [경로...]   (경로 생략 시 전체 변경 git add -A)
set -euo pipefail

MSG="${1:-}"
if [ -z "$MSG" ]; then echo 'usage: omai-commit "message" [paths...]' >&2; exit 1; fi
shift || true

# oh-my-ai 레포 위치 (settings.json 심링크 역추적 → 머신 무관)
REPO=$(dirname "$(dirname "$(readlink -f ~/.claude/settings.json)")")
cd "$REPO"

# cascade 위생 검사 (계정 전환 전에 — 실패 시 깨끗이 중단)
if [ "${OMAI_SKIP_CASCADE:-}" != "1" ]; then
  bash "$REPO/claude/scripts/cascade-check.sh" || exit 1
fi

# 현재 계정 기억 → 종료 시(성공/실패 무관) 항상 복귀
PREV=$(gh auth status 2>/dev/null | awk '/ account /{for(i=1;i<=NF;i++) if($i=="account") a=$(i+1)} /Active account: true/{print a; exit}' || true)
restore() { if [ -n "${PREV:-}" ] && [ "$PREV" != "aixion1506" ]; then gh auth switch --user "$PREV" >/dev/null 2>&1 || true; fi; }
trap restore EXIT

gh auth switch --user aixion1506 >/dev/null 2>&1

if [ "$#" -gt 0 ]; then git add -- "$@"; else git add -A; fi
git commit -m "$MSG"
git push

echo "✓ omai-commit 완료 (author/push=aixion1506, 계정 복귀=${PREV:-?})"
