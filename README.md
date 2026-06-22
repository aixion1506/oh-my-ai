# oh-my-ai

개인 AI 도구 설정·맥락을 git으로 관리하는 레포.

> 단순 설정 백업이 아니다. **Claude Code(나 Codex)를 내 워크플로에 맞춰 길들이는 개인 하네스 레이어**다. 도구의 유용함은 쓰되, **진화의 방향은 사람이 잡는다.**

## 뭐가 특별한가 (하네스 레이어)

반복되는 업무를 Claude가 **감지해 제안**하고, 내가 **컨펌하면 도구로 굳힌다.** 자동으로 굴러가는 게 아니라 — **사람이 게이트하며 쌓는다.** 쓸수록 내가 진화시킨다.

- **감지 + 컨펌 게이트**: 반복·수작업·실수 잦은 절차가 보이면 Claude가 "이거 자동화할까?" 넛지 → **컨펌해야** 커맨드/스킬로 구조화한다 (안 누르면 안 만듦). (`claude/skills/harness-automation`, `claude/automation-backlog.md`)
- **작업 라우팅**: 작업을 시작하면 그 도메인에 맞는 스킬·커맨드·문서가 자동으로 붙는다. (`claude/CLAUDE.md`의 라우팅 표)
- **경험 누적 = 내가 키우는 파생 스킬**: 외부 스킬을 베이스로 내 경험·context를 얹어 "내 스킬"로 키운다.
- **세션이 끊겨도 이어짐**: 작업 맥락(결정·설계 배경)을 `docs/context/`에 남겨, 새 세션·다른 날에도 이어받는다. (`claude/skills/project-context`)
- **사용 측정 + 안전 가드**: 어떤 스킬/커맨드를 실제 쓰는지 로그로 쌓아 **안 쓰는 걸 식별·정리**한다 (`~/.claude/harness-usage.log`). 안전 규칙(개인계정 커밋)은 훅으로 강제(`claude/hooks/`).
- **목적 위주 표현 원칙**: 커밋·일일보고·문서를 "무엇을 했나"가 아니라 "왜/무엇을 위해"로 쓴다.
- **내가 만든 것 인덱스**: 커스텀 산출물만 모아 한눈에 → [`claude/MINE.md`](claude/MINE.md)

### 설계 원칙 (다른 dotfiles와 다른 점)

- **런타임 비속박**: Claude Code 기준이지만 스킬·커맨드·훅의 *내용*은 텍스트/셸이라 Codex 등 다른 런타임에도 복붙+리네임으로 이식된다. 특정 모델·런타임에 묶이지 않는다. (모델은 성능 따라 갈아끼우고, 레이어는 유지한다.)
- **사람이 고삐 (human-gate)**: 회사 코드를 다루므로 AI에 전권을 주지 않는다. 도구는 제안·보조하고, **실행 결정은 사람이** 내린다.

> 설계·결정·현황 전체는 [`docs/harness-design.md`](docs/harness-design.md) (단일 기준점).

## 왜 만들었나

Claude Code를 쓰다 보면 개인 스타일(코드 안 편집, 한국어 대화 등)·자주 쓰는 스킬·커맨드, 그리고 **작업 맥락(결정·설계 배경)** 이 쌓인다. 이게 `~/.claude/` 나 한 세션 안에만 있으면:

- 컴퓨터가 여러 대면 매번 세팅 다시 해야 함
- devcontainer 열 때마다 초기화됨
- **세션·머신이 바뀌면 맥락이 날아가 같은 설명을 또 하게 됨**
- 어딘가에서 바꾼 내용이 다른 곳엔 없음

1차 목적은 설정과 맥락을 git으로 한 곳에 모아 **어디서든·언제든 같은 환경 + 컨텍스트**가 유지되게 하는 것.

근데 단순 동기화에서 멈추지 않는다 — **반복 작업을 Claude가 감지해 제안하고, 내가 컨펌해 커스텀 도구(스킬·커맨드·스크립트·훅)로 쌓는다.** 다른 dotfiles/설정 모음과 달리, **도구를 제안받아 사람이 게이트하며 내 워크플로에 맞춰 쌓이는 레이어**다.

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
  CLAUDE.md              ← 개인 스타일·표현 원칙·품질 기준·작업 라우팅·자동화 트리거·하네스 용어
  settings.json          ← 플러그인 설정 + 훅(SessionStart 주입 / 사용 측정 / 회사계정 push 가드)
  skills/                ← 커스텀 스킬 (harness-automation, project-context …)
  commands/              ← 커스텀 커맨드 (release-note …)
  scripts/               ← 셸 스크립트 (omai-commit …)
  hooks/                 ← 훅 스크립트 (oh-my-ai-push-guard …)
  agents/                ← 커스텀 에이전트
  automation-backlog.md  ← 자동화 후보 누적장 (세션 시작 시 자동 로드)
  MINE.md                ← 내가 만든 커스텀 산출물 인덱스
docs/
  harness-design.md      ← 하네스 설계·결정·현황 (단일 기준점)
  devcontainer-workflow.md ← oh-my-ai/심링크/계정 워크플로 상세
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

실제 머신에서는 `~/.claude/skills/`에 추가하면 레포에 바로 반영됨 (심링크). 커밋은 **개인계정 전환을 자동화한 단축 스크립트** 권장:

```bash
bash claude/scripts/omai-commit.sh "feat(skill): ..."   # 전환→add→commit→push→복귀 한 번에
```

수동으로 하려면 `gh auth switch --user aixion1506` 후 `git add/commit/push`, 끝나면 `gh auth switch --user shpark-nurilab`. (회사계정 push는 가드 훅이 차단.)
