#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "usage: codex-work-start-entry.sh [<single task argument>]" >&2
  exit 2
fi

RAW_TASK="${TASK:-}"
if [ "$#" -eq 1 ]; then
  RAW_TASK="$1"
fi

NORMALIZED_TASK="$RAW_TASK"
if [[ "$NORMALIZED_TASK" =~ ^[[:space:]]*\$work-start([[:space:]]|$) ]]; then
  NORMALIZED_TASK="${NORMALIZED_TASK:${#BASH_REMATCH[0]}}"
fi

PUBLIC_ENTRY="${OH_MY_AI_ENTRY:-$HOME/.local/bin/oh-my-ai}"
exec "$PUBLIC_ENTRY" work-start -- "$NORMALIZED_TASK"
