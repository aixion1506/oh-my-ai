# oh-my-ai

개인 AI 설정 레포.

## 설치

```bash
git clone https://github.com/aixion1506/oh-my-ai.git ~/oh-my-ai
cd ~/oh-my-ai
./setup.sh
```

## 구조

```text
claude/     # Claude Code 설정 (skills, commands, agents, CLAUDE.md)
gemini/     # Gemini CLI 설정
shared/     # 공통 스타일
```

## 프로젝트별 추가 설정

CodeGraph는 프로젝트마다 별도 초기화 필요:

```bash
cd <your-project>
codegraph init -i
```
