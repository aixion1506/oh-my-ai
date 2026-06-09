#!/bin/bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "=== oh-my-ai setup ==="
mkdir -p "$CLAUDE_DIR"

ln -sf "$REPO/claude/CLAUDE.md"     "$CLAUDE_DIR/CLAUDE.md"
ln -sf "$REPO/claude/settings.json" "$CLAUDE_DIR/settings.json"

rm -rf  "$CLAUDE_DIR/skills"   && ln -sf "$REPO/claude/skills"   "$CLAUDE_DIR/skills"
rm -rf  "$CLAUDE_DIR/commands" && ln -sf "$REPO/claude/commands" "$CLAUDE_DIR/commands"
rm -rf  "$CLAUDE_DIR/agents"   && ln -sf "$REPO/claude/agents"   "$CLAUDE_DIR/agents"

echo "=== done ==="
