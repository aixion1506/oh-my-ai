#!/bin/bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "=== oh-my-ai setup ==="

# 1. ~/.claude 디렉토리 구조 생성
mkdir -p "$CLAUDE_DIR/skills"

# 2. 설정 파일 심링크 (파일 하나씩 — ~/.claude 전체 교체 안 함)
ln -sf "$REPO/claude/CLAUDE.md"     "$CLAUDE_DIR/CLAUDE.md"
ln -sf "$REPO/claude/settings.json" "$CLAUDE_DIR/settings.json"
echo "  linked: CLAUDE.md, settings.json"

# 3. 스킬 디렉토리 심링크
for skill_dir in "$REPO/claude/skills/"*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  ln -sf "$skill_dir" "$CLAUDE_DIR/skills/$skill_name"
  echo "  linked skill: $skill_name"
done

# 4. 마켓플레이스 플러그인 설치
echo "Installing plugins..."
claude plugin install superpowers
claude plugin install skill-creator
claude plugin install context7
claude plugin install code-review
claude plugin install serena
claude plugin install atlassian

echo "=== done. Claude Code 재시작하면 적용됩니다 ==="
