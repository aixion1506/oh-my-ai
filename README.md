# oh-my-ai

개인용 **AI Agent Control Plane / Orchestration Harness**.

> 단순 설정 백업이 아니다. **Claude Code, Codex, OpenClone 같은 AI 런타임을 내 워크플로에 맞춰 느슨하게 연결하는 개인 하네스 레이어**다. 도구의 유용함은 쓰되, **진화의 방향은 사람이 잡는다.**

## 뭐가 특별한가 (하네스 레이어)

반복되는 업무를 AI가 **감지해 제안**하고, 내가 **컨펌하면 도구로 굳힌다.** 자동으로 굴러가는 게 아니라 — **사람이 게이트하며 쌓는다.** 쓸수록 내가 진화시킨다.

oh-my-ai는 하나의 AI agent가 아니라, 여러 런타임과 도구를 붙였다 떼는 **control plane / orchestration harness**다. 원칙·컨텍스트·스킬·안전 정책·작업 라우팅은 oh-my-ai에 남기고, Claude Code/Codex/OpenClone 같은 실행 표면은 adapter로 연결한다.

Jikji, Superpowers, MCP, `rg`/`find`, `rsync` 같은 외부 도구도 필요하면 optional backend/adapter로 붙일 수 있다. 좋은 도구가 나오면 모듈처럼 붙이고, 마음에 안 들면 교체한다. 특정 모델·런타임·도구가 아니라 **개인 워크플로 레이어**가 본체다.

- **감지 + 컨펌 게이트**: 반복·수작업·실수 잦은 절차가 보이면 AI가 "이거 자동화할까?" 넛지 → **컨펌해야** 커맨드/스킬로 구조화한다 (안 누르면 안 만듦). (`skills/harness-automation`, `automation-backlog.md`)
- **작업 라우팅**: 작업을 시작하면 그 도메인에 맞는 스킬·커맨드·문서가 자동으로 붙는다. (`instructions/harness.md`의 라우팅 표)
- **경험 누적 = 내가 키우는 파생 스킬**: 외부 스킬을 베이스로 내 경험·context를 얹어 "내 스킬"로 키운다.
- **세션이 끊겨도 이어짐**: 작업 맥락(결정·설계 배경)을 `docs/context/`에 남겨, 새 세션·다른 날에도 이어받는다. (`skills/project-context`)
- **사용 측정 + 안전 가드**: 어떤 스킬을 실제 쓰는지 Git 저장소 정보와 함께 **oh-my-ai XDG state**에 기록한다 (`~/.local/state/oh-my-ai/harness-usage.log`). 안전 규칙(개인계정 커밋)은 훅으로 강제(`claude/hooks/`).
- **목적 위주 표현 원칙**: 커밋·일일보고·문서를 "무엇을 했나"가 아니라 "왜/무엇을 위해"로 쓴다.
- **내가 만든 것 인덱스**: 커스텀 산출물만 모아 한눈에 → [`MINE.md`](MINE.md)

### 설계 원칙 (다른 dotfiles와 다른 점)

- **런타임 비속박**: 개인 규칙의 근원은 `instructions/harness.md`이고, `CLAUDE.md`, `claude/CLAUDE.md`, `AGENTS.md`는 AI별 adapter로 생성된다. 특정 모델·런타임·도구에 묶이지 않는다. Claude Code/Codex/OpenClone 같은 런타임과 Jikji/Superpowers/MCP/`rg`/`find`/`rsync` 같은 도구는 backend/adapter로 느슨하게 붙이고, 성능·취향·안전 기준에 따라 갈아끼운다. 레이어는 유지한다.
- **사람이 고삐 (human-gate)**: 회사 코드를 다루므로 AI에 전권을 주지 않는다. 도구는 제안·보조하고, **실행 결정은 사람이** 내린다.

개념 구조:

```text
oh-my-ai (Personal AI Agent Control Plane / Orchestration Harness)
├─ source of truth: instructions / context docs / skills / safety policy / routing
├─ implemented adapters: Claude Code, Codex
├─ implemented tools: hooks, harness-event, rg/find-based local inspection
└─ optional backend candidates: Jikji, Superpowers, MCP, rsync, other agent runtimes
```

> 설계·결정·현황 전체는 [`docs/harness-design.md`](docs/harness-design.md) (단일 기준점).

## 왜 만들었나

AI coding tool을 쓰다 보면 개인 스타일(코드 안 편집, 한국어 대화 등)·자주 쓰는 스킬·커맨드, 그리고 **작업 맥락(결정·설계 배경)** 이 쌓인다. 이게 `~/.claude/` 나 한 세션 안에만 있으면:

- 컴퓨터가 여러 대면 매번 세팅 다시 해야 함
- devcontainer 열 때마다 초기화됨
- **세션·머신이 바뀌면 맥락이 날아가 같은 설명을 또 하게 됨**
- 어딘가에서 바꾼 내용이 다른 곳엔 없음

1차 목적은 설정과 맥락을 git으로 한 곳에 모아 **어디서든·언제든 같은 환경 + 컨텍스트**가 유지되게 하는 것.

근데 단순 동기화에서 멈추지 않는다 — **반복 작업을 AI가 감지해 제안하고, 내가 컨펌해 커스텀 도구(스킬·커맨드·스크립트·훅)로 쌓는다.** 다른 dotfiles/설정 모음과 달리, **도구를 제안받아 사람이 게이트하며 내 워크플로에 맞춰 쌓이는 레이어**다.

## 뭐가 편해지나

| 상황 | 기존 | 이후 |
|------|------|------|
| 새 컴 세팅 | AI별 설정 수동 세팅 | `make install` 한 번 |
| devcontainer | AI별 설정 없음 | VS Code Dotfiles로 자동 적용 |
| 설정 수정 | 머신별로 따로 | 레포에서 수정 → `git push` → 어디서든 `make update` |
| 스킬 추가 | 해당 머신에만 존재 | `git push`하면 다른 머신에도 동기화 |

## 구조

```text
instructions/
  harness.md             ← 개인 스타일·표현 원칙·품질 기준·작업 라우팅·자동화 트리거의 원본
  mine.md                ← 커스텀 산출물 인덱스 템플릿
  adapters/
    claude.md            ← Claude Code용 adapter header
    codex.md             ← Codex용 adapter header
CLAUDE.md                ← Claude가 루트에서 읽는 생성물 (make instructions로 재생성)
AGENTS.md                ← Codex가 루트에서 읽는 생성물 (make instructions로 재생성)
automation-backlog.md    ← 공용 자동화 후보 누적장
MINE.md                  ← SKILL.md 메타데이터로 생성되는 커스텀 산출물 인덱스
skills/
  ...                    ← 공용 스킬 원본 (harness-automation, project-context …)
claude/
  CLAUDE.md              ← ~/.claude/CLAUDE.md로 연결되는 Claude 생성물
  settings.json          ← 플러그인 설정 + 훅(SessionStart 주입 / 사용 측정 / 회사계정 push 가드)
  hooks/                 ← 훅 스크립트 (oh-my-ai-push-guard …)
  agents/                ← 커스텀 에이전트
scripts/
  render-instructions.sh ← 스킬 메타데이터로 라우팅·MINE·AI별 instruction 생성
  harness-event.mjs      ← 런타임 중립 SkillStart 기록·저장소별 집계
  omai-commit.sh         ← 개인 계정 커밋·푸시 자동화
  cascade-check.sh       ← 비스킬 산출물 등록 drift 검사
hooks/
  pre-commit             ← 하네스 원본 변경 시 파생 산출물 자동 재생성
docs/
  harness-design.md      ← 하네스 설계·결정·현황 (단일 기준점)
  devcontainer-workflow.md ← oh-my-ai/심링크/계정 워크플로 상세
```

## 스킬 사용량 조회

공용 로그는 Git에 커밋하지 않고 `${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-ai/harness-usage.log`에 JSONL로 저장한다.

```bash
harness-event report                                      # 현재 Git 저장소
harness-event report --all                                # 전체 저장소
harness-event report --repo github.com/aixion1506/oh-my-ai
harness-event report --since-days 30
```

## 설치

### 실제 머신 (심링크 방식)

```bash
git clone https://github.com/aixion1506/oh-my-ai.git ~/Github/oh-my-ai
cd ~/Github/oh-my-ai
make install
```

`make install`은 `~/.claude/CLAUDE.md`, `~/.claude/skills`, `~/.codex/AGENTS.md`, `~/.agents/skills`를 레포의 생성물/공용 원본으로 심링크한다.
기존 `~/.agents/skills`가 실제 디렉터리면 최초 적용 시 `~/.agents/skills.pre-oh-my-ai`로 보존한 뒤 링크한다.
공유 규칙은 `instructions/harness.md`를 수정한 뒤 `make instructions`로 재생성한다. `make install`은 재생성 후 Claude/Codex instruction 심링크를 함께 잡는다.

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

이후 새 devcontainer 뜰 때마다 VS Code가 자동으로 레포 clone + `setup.sh` 실행. `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.agents/skills`까지 연결한다.

### devcontainer (심링크 방식)

복사 방식은 스킬/커맨드 수정이 레포에 바로 반영되지 않음. 실제 머신처럼 심링크를 유지하고 싶다면 별도 가이드 참고.

→ [docs/devcontainer-symlink.md](docs/devcontainer-symlink.md)

## 스킬/커맨드/에이전트 추가

`~/.claude/skills`와 `~/.agents/skills`는 모두 레포의 `skills/`를 가리킨다. 커스텀 스킬은 `SKILL.md` frontmatter에 `source`, `summary`, 필요시 `route`를 한 번만 작성한다. `make instructions`가 라우팅 표와 `MINE.md`를 생성하며, 설치된 pre-commit 훅도 커밋 직전에 자동 실행한다. 커밋은 **개인계정 전환을 자동화한 단축 스크립트** 권장:

```bash
bash scripts/omai-commit.sh "feat(skill): ..."   # 전환→add→commit→push→복귀 한 번에
```

수동으로 하려면 `gh auth switch --user aixion1506` 후 `git add/commit/push`, 끝나면 `gh auth switch --user shpark-nurilab`. (회사계정 push는 가드 훅이 차단.)
