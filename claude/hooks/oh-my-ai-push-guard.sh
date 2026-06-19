#!/usr/bin/env bash
# oh-my-ai push 안전 가드 (PreToolUse / Bash 훅)
# oh-my-ai 레포에 회사계정(active gh ≠ aixion1506)으로 push 시도 시 차단한다.
# 결정성 업그레이드: CLAUDE.md의 soft 규칙("개인계정으로만")을 hard로 강제.
# fail-open: 감지 실패 시 막지 않음(정상 작업 방해 최소화). git이 권한거부할 수도 있으나 이건 더 빠른 친절 가드.

CMD=$(jq -r '.tool_input.command // empty' 2>/dev/null)

# push 명령이 아니면 통과
case "$CMD" in *"git push"*) ;; *) exit 0 ;; esac
# 명령이 스스로 개인계정으로 전환하면 통과 (정상 워크플로)
case "$CMD" in *"switch --user aixion1506"*) exit 0 ;; esac

# 대상이 oh-my-ai 인가? (명령 문자열 or 현재 cwd 레포 remote)
TARGET=no
case "$CMD" in *oh-my-ai*) TARGET=yes ;; esac
if [ "$TARGET" = no ]; then
  case "$(git remote get-url origin 2>/dev/null)" in *oh-my-ai*) TARGET=yes ;; esac
fi
[ "$TARGET" = yes ] || exit 0

# 활성 gh 계정 파싱
ACTIVE=$(gh auth status 2>/dev/null | awk '/ account /{for(i=1;i<=NF;i++) if($i=="account") a=$(i+1)} /Active account: true/{print a; exit}')

# 개인계정이 아니면 차단
if [ -n "$ACTIVE" ] && [ "$ACTIVE" != "aixion1506" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"oh-my-ai push 차단: 활성 gh 계정=%s (개인 aixion1506 아님). `gh auth switch --user aixion1506` 후 재시도."}}' "$ACTIVE"
fi
exit 0
