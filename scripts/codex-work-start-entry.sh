#!/usr/bin/env bash
set -euo pipefail

RAW_TASK="${TASK:-}"
if [ "$#" -gt 0 ]; then
  RAW_TASK="$*"
fi

NORMALIZED_TASK="$RAW_TASK"
if [[ "$NORMALIZED_TASK" =~ ^[[:space:]]*\$work-start([[:space:]]|$) ]]; then
  NORMALIZED_TASK="${NORMALIZED_TASK:${#BASH_REMATCH[0]}}"
fi

PUBLIC_ENTRY="${OH_MY_AI_ENTRY:-$HOME/.local/bin/oh-my-ai}"
exec "$PUBLIC_ENTRY" work-start -- "$NORMALIZED_TASK"
