#!/bin/bash
  REPO="$(cd "$(dirname "$0")" && pwd)"

  # Claude 심링크
  ln -sf "$REPO/claude" ~/.claude

  # 플러그인 설치
  claude plugin install commit-commands
  claude plugin install context7
  claude plugin install mongodb
  claude plugin install serena
  claude plugin install skill-creator
  claude plugin install superpowers
  claude plugin install code-review

  echo "done"

# CodeGraph
  curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh