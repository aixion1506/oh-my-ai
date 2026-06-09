#!/bin/bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "=== oh-my-ai setup ==="
mkdir -p "$CLAUDE_DIR"

cp "$REPO/claude/CLAUDE.md"     "$CLAUDE_DIR/CLAUDE.md"
cp "$REPO/claude/settings.json" "$CLAUDE_DIR/settings.json"

[ -d "$REPO/claude/skills" ]   && cp -r "$REPO/claude/skills"   "$CLAUDE_DIR/"
[ -d "$REPO/claude/agents" ]   && cp -r "$REPO/claude/agents"   "$CLAUDE_DIR/"
[ -d "$REPO/claude/commands" ] && cp -r "$REPO/claude/commands" "$CLAUDE_DIR/"

echo "=== done ==="
