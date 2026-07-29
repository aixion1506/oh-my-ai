#!/usr/bin/env bash
set -u
BASE="${OH_MY_AI_NOTIFY_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-ai/notifications}"
exec "$BASE/dispatcher" "${1:-}"
