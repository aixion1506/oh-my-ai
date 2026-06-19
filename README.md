# oh-my-ai

개인 AI 도구 설정을 git으로 관리하는 레포.

> 단순 설정 백업이 아니다. **Claude Code를 "내 워크플로를 학습하는 개인 AI 하네스"로 키우는** 레포다.

## 뭐가 특별한가 (하네스)

반복되는 내 업무를 Claude가 **스스로 감지 → 도구화 → 다음부터 자동 적용**하도록 설계했다. 쓸수록 나에게 맞게 진화한다.

- **반복 업무 자동 감지**: 같은 일을 반복하거나 수작업·실수 잦은 절차가 보이면 Claude가 먼저 "이거 자동화할까?" 넛지 → 컨펌하면 커맨드/스킬로 구조화. (`claude/skills/harness-automation`, `claude/automation-backlog.md`)
- **작업 라우팅**: 작업을 시작하면 그 도메인에 맞는 스킬·커맨드·문서가 자동으로 붙는다. (`claude/CLAUDE.md`의 작업 라우팅 표)
- **경험 누적 = 진화하는 스킬**: 외부 스킬을 베이스로 내 경험·context를 얹어 "내 파생 스킬"로 키운다.
- **목적 위주 표현 원칙**: 커밋·일일보고·문서를 "무엇을 했나"가 아니라 "왜/무엇을 위해"로 쓴다.
- **내가 만든 것 인덱스**: 커스텀 산출물만 모아 한눈에 → [`claude/MINE.md`](claude/MINE.md)

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
  CLAUDE.md              ← 개인 스타일 + 표현 원칙 + 작업 라우팅 + 자동화 트리거
  settings.json          ← 플러그인 설정 + SessionStart 훅
  skills/                ← 커스텀 스킬 (harness-automation 등)
  commands/              ← 커스텀 커맨드 (release-note 등)
  agents/                ← 커스텀 에이전트
  automation-backlog.md  ← 자동화 후보 누적장 (세션 시작 시 자동 로드)
  MINE.md                ← 내가 만든 커스텀 산출물 인덱스
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
