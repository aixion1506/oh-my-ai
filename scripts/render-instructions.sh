#!/bin/sh
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$REPO/instructions/harness.md"
CLAUDE_ADAPTER="$REPO/instructions/adapters/claude.md"
CODEX_ADAPTER="$REPO/instructions/adapters/codex.md"
CLAUDE_OUTPUT="$REPO/claude/CLAUDE.md"
CODEX_OUTPUT="$REPO/AGENTS.md"

render() {
  adapter="$1"
  output="$2"

  {
    printf '%s\n\n' '<!-- GENERATED FILE. Edit instructions/harness.md or instructions/adapters/*.md, then run make instructions. -->'
    cat "$adapter"
    printf '\n---\n\n'
    cat "$SOURCE"
  } > "$output"
}

render "$CLAUDE_ADAPTER" "$CLAUDE_OUTPUT"
render "$CODEX_ADAPTER" "$CODEX_OUTPUT"

printf 'Rendered %s\n' "$CLAUDE_OUTPUT"
printf 'Rendered %s\n' "$CODEX_OUTPUT"
