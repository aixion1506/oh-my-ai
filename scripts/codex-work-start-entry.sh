#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

RAW_TASK="${TASK:-}"
if [ "$#" -gt 0 ]; then
  RAW_TASK="$*"
fi

NORMALIZED_TASK="$RAW_TASK"
if [[ "$NORMALIZED_TASK" =~ ^[[:space:]]*\$work-start([[:space:]]|$) ]]; then
  NORMALIZED_TASK="${NORMALIZED_TASK:${#BASH_REMATCH[0]}}"
fi

TASK="$NORMALIZED_TASK" scripts/work-start.sh
