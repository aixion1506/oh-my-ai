# oh-my-ai

개인 AI 설정 레포. Claude Code 환경을 어느 머신에서든 동일하게 세팅.

## 구조

```
claude/
  CLAUDE.md       ← 개인 개발 스타일 (글로벌 적용)
  settings.json   ← 플러그인 설정
  skills/         ← 커스텀 스킬
  commands/       ← 커스텀 커맨드
  agents/         ← 커스텀 에이전트
```

## 설치

### 실제 머신 (심링크 방식 — git으로 변경 추적)

```bash
git clone https://github.com/aixion1506/oh-my-ai.git ~/Github/oh-my-ai
cd ~/Github/oh-my-ai
make install
```

`~/.claude/` 안의 CLAUDE.md, settings.json, skills/, commands/, agents/가
레포 파일로 심링크됨. 수정하면 바로 git에 반영.

업데이트:

```bash
make update   # git pull + 심링크 재연결
```

### devcontainer (복사 방식)

VS Code Settings (JSON)에 추가:

```json
"dotfiles.repository": "https://github.com/aixion1506/oh-my-ai",
"dotfiles.installCommand": "setup.sh"
```

이후 새 devcontainer 뜰 때마다 자동으로 `setup.sh` 실행됨.

## 스킬/커맨드/에이전트 추가

실제 머신에서는 `~/.claude/skills/`에 추가하면 레포에 바로 반영됨 (심링크).

```bash
cd ~/Github/oh-my-ai
git add claude/skills/새스킬
git commit -m "feat(skill): ..."
git push
```
