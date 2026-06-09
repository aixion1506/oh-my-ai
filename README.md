# oh-my-ai

개인 AI 도구 설정을 git으로 관리하는 레포.

## 왜 만들었나

Claude Code를 쓰다 보면 개인 스타일(코드 안 편집, 한국어 대화 등), 자주 쓰는 스킬, 커맨드가 쌓인다.
문제는 이게 `~/.claude/` 안에만 있으면:

- 컴퓨터가 여러 대면 매번 세팅 다시 해야 함
- devcontainer 열 때마다 초기화됨
- 어딘가에서 바꾼 내용이 다른 곳엔 없음

이 레포는 그 설정들을 git으로 관리해서, 어디서든 clone + 명령어 하나로 동일한 환경을 만드는 게 목적.

## 뭐가 편해지나

| 상황 | 기존 | 이후 |
|------|------|------|
| 새 컴 세팅 | `~/.claude/` 수동 세팅 | `make install` 한 번 |
| devcontainer | Claude 설정 없음 | VS Code Dotfiles로 자동 적용 |
| 설정 수정 | 머신별로 따로 | 레포에서 수정 → `git push` → 어디서든 `make update` |
| 스킬 추가 | 해당 머신에만 존재 | `git push`하면 다른 머신에도 동기화 |

## 구조

```text
claude/
  CLAUDE.md       ← 개인 개발 스타일 (글로벌 적용)
  settings.json   ← 플러그인 설정
  skills/         ← 커스텀 스킬
  commands/       ← 커스텀 커맨드
  agents/         ← 커스텀 에이전트
```

## 설치

### 실제 머신 (심링크 방식)

```bash
git clone https://github.com/aixion1506/oh-my-ai.git ~/Github/oh-my-ai
cd ~/Github/oh-my-ai
make install
```

`~/.claude/` 안의 파일들이 레포를 가리키는 심링크가 됨.
이후 `~/.claude/`에서 수정하면 바로 레포에 반영되고, git으로 추적 가능.

업데이트:

```bash
make update   # git pull + 심링크 재연결
```

### devcontainer (복사 방식)

VS Code Settings (JSON)에 한 번만 추가:

```json
"dotfiles.repository": "https://github.com/aixion1506/oh-my-ai",
"dotfiles.installCommand": "setup.sh"
```

이후 새 devcontainer 뜰 때마다 VS Code가 자동으로 레포 clone + `setup.sh` 실행.

### devcontainer (심링크 방식)

복사 방식은 스킬/커맨드 수정이 레포에 바로 반영되지 않음. 실제 머신처럼 심링크를 유지하고 싶다면 별도 가이드 참고.

→ [docs/devcontainer-symlink.md](docs/devcontainer-symlink.md)

## 스킬/커맨드/에이전트 추가

실제 머신에서는 `~/.claude/skills/`에 추가하면 레포에 바로 반영됨 (심링크).

```bash
cd ~/Github/oh-my-ai
git add claude/skills/새스킬
git commit -m "feat(skill): ..."
git push
```
