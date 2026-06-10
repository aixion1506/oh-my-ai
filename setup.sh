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

grep -qxF "source $REPO/devcontainer/start-pg-proxy.sh" "$HOME/.bashrc" || \
    echo "source $REPO/devcontainer/start-pg-proxy.sh" >> "$HOME/.bashrc"

# oh-my-ai 레포는 회사 계정과 분리된 개인 계정으로만 커밋되도록 local git config 고정
git -C "$REPO" config user.name "aixion1506"
git -C "$REPO" config user.email "aixion1506@gmail.com"

echo "=== done ==="
