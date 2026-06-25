#!/bin/bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CODEX_DIR="$HOME/.codex"
AGENT_DIR="$HOME/.agents"

echo "=== oh-my-ai setup ==="

"$REPO/scripts/render-instructions.sh"

mkdir -p "$CLAUDE_DIR"
mkdir -p "$CODEX_DIR"
mkdir -p "$AGENT_DIR"
mkdir -p "$HOME/.local/bin"

# devcontainer에는 codex CLI가 없을 수 있으므로 dotfiles 적용 시 같이 설치한다.
if ! command -v codex >/dev/null 2>&1; then
    if [ -x "$REPO/install.sh" ]; then
        CODEX_NON_INTERACTIVE=1 sh "$REPO/install.sh" || npm install -g --prefix "$HOME/.local" @openai/codex
    else
        npm install -g --prefix "$HOME/.local" @openai/codex
    fi
fi

ln -sf "$REPO/claude/CLAUDE.md"     "$CLAUDE_DIR/CLAUDE.md"
ln -sf "$REPO/claude/settings.json" "$CLAUDE_DIR/settings.json"
ln -sf "$REPO/AGENTS.md"            "$CODEX_DIR/AGENTS.md"
ln -sf "$REPO/scripts/harness-event.mjs" "$HOME/.local/bin/harness-event"
if [ -d "$AGENT_DIR/skills" ] && [ ! -L "$AGENT_DIR/skills" ]; then
    if [ -e "$AGENT_DIR/skills.pre-oh-my-ai" ]; then
        echo "backup exists: $AGENT_DIR/skills.pre-oh-my-ai" >&2
        exit 1
    fi
    mv "$AGENT_DIR/skills" "$AGENT_DIR/skills.pre-oh-my-ai"
fi
rm -f "$AGENT_DIR/skills" && ln -sf "$REPO/skills" "$AGENT_DIR/skills"

rm -rf  "$CLAUDE_DIR/skills"   && ln -sf "$REPO/skills"          "$CLAUDE_DIR/skills"
if [ -L "$CLAUDE_DIR/commands" ] && [ "$(readlink "$CLAUDE_DIR/commands")" = "$REPO/claude/commands" ]; then
    rm "$CLAUDE_DIR/commands"
fi
rm -rf  "$CLAUDE_DIR/agents"   && ln -sf "$REPO/claude/agents"   "$CLAUDE_DIR/agents"

grep -qxF "source $REPO/devcontainer/start-pg-proxy.sh" "$HOME/.bashrc" || \
    echo "source $REPO/devcontainer/start-pg-proxy.sh" >> "$HOME/.bashrc"

# oh-my-ai 레포는 회사 계정과 분리된 개인 계정으로만 커밋되도록 local git config 고정
git -C "$REPO" config user.name "aixion1506"
git -C "$REPO" config user.email "aixion1506@gmail.com"

echo "=== done ==="
