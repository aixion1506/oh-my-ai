# oh-my-ai

**AI Agent Control Plane / Orchestration Harness** shared template.

> 단순 설정 백업이 아니다. **Claude Code, Codex, OpenClone 같은 AI 런타임을 사용자 워크플로에 맞춰 느슨하게 연결하는 하네스 레이어**다. 도구의 유용함은 쓰되, **진화의 방향은 사람이 잡는다.**

## 뭐가 특별한가 (하네스 레이어)

반복되는 업무를 AI가 **감지해 제안**하고, 사용자가 **컨펌하면 도구로 굳힌다.** 자동으로 굴러가는 게 아니라 — **사람이 게이트하며 쌓는다.** 쓸수록 사용자 워크플로에 맞게 진화한다.

oh-my-ai는 하나의 AI agent가 아니라, 여러 런타임과 도구를 붙였다 떼는 **control plane / orchestration harness**다. 원칙·컨텍스트·스킬·안전 정책·작업 라우팅은 oh-my-ai에 남기고, Claude Code/Codex/OpenClone 같은 실행 표면은 adapter로 연결한다.

Jikji, Superpowers, MCP, `rg`/`find`, `rsync` 같은 외부 도구도 필요하면 optional backend/adapter로 붙일 수 있다. 좋은 도구가 나오면 모듈처럼 붙이고, 마음에 안 들면 교체한다. 특정 모델·런타임·도구가 아니라 **사용자 워크플로 레이어**가 본체다.

- **감지 + 컨펌 게이트**: 반복·수작업·실수 잦은 절차가 보이면 AI가 "이거 자동화할까?" 넛지 → **컨펌해야** 커맨드/스킬로 구조화한다 (안 누르면 안 만듦). (`skills/harness-automation`, `automation-backlog.md`)
- **작업 라우팅**: 작업을 시작하면 그 도메인에 맞는 스킬·커맨드·문서가 자동으로 붙는다. (`instructions/harness.md`의 라우팅 표)
- **경험 누적 = 커스텀 파생 스킬**: 외부 스킬을 베이스로 사용자 경험·context를 얹어 profile/local workflow에 맞게 키운다.
- **세션이 끊겨도 이어짐**: 작업 맥락(결정·설계 배경)을 `docs/context/`에 남겨, 새 세션·다른 날에도 이어받는다. (`skills/project-context`)
- **사용 측정**: 어떤 스킬을 실제 쓰는지 Git 저장소 정보와 함께 **oh-my-ai XDG state**에 기록한다 (`~/.local/state/oh-my-ai/harness-usage.log`). 개인 계정 정책이나 push guard는 profile/private script로 분리한다.
- **목적 위주 표현 원칙**: 커밋·일일보고·문서를 "무엇을 했나"가 아니라 "왜/무엇을 위해"로 쓴다.
- **커스텀 산출물 인덱스**: 커스텀 산출물만 모아 한눈에 → [`MINE.md`](MINE.md)

## 핵심 기능

| 기능 | 설명 |
|------|------|
| Runtime adapters | Claude Code, Codex 등 런타임별 instruction을 공통 원본에서 생성한다 |
| Skill routing | 작업 유형에 맞는 스킬·플레이북을 연결하고, 두꺼운 절차는 필요할 때만 로드한다 |
| Project context | 설계 배경·결정 로그·파일 맵·핸드오프를 `docs/context/`에 축적한다 |
| Human-gated automation | 반복 작업을 감지하되, 사람이 승인해야 스킬·커맨드·스크립트로 굳힌다 |
| Profile/local guards | 개인별 계정·커밋 정책은 profile, local hook, private script로 분리하고 기본 설치에서는 활성화하지 않는다 |
| Execution modes | `suggest-only`, `patch-with-approval`, `auto-apply`로 파일 수정 방식을 선택한다 |
| Usage observability | 스킬 사용을 저장소 단위로 기록해 죽은 스킬은 정리하고 자주 쓰는 흐름은 강화한다 |
| Instruction cascade | `SKILL.md` 메타데이터에서 `AGENTS.md`, `CLAUDE.md`, `MINE.md`를 생성한다 |
| Optional backends | Jikji, Superpowers, MCP, `rg`/`find`, `rsync` 같은 도구를 필요할 때 adapter/backend로 붙인다 |

### 설계 원칙 (다른 dotfiles와 다른 점)

- **런타임 비속박**: 공유 규칙의 근원은 `instructions/harness.md`이고, `CLAUDE.md`, `claude/CLAUDE.md`, `AGENTS.md`는 AI별 adapter로 생성된다. 특정 모델·런타임·도구에 묶이지 않는다. Claude Code/Codex/OpenClone 같은 런타임과 Jikji/Superpowers/MCP/`rg`/`find`/`rsync` 같은 도구는 backend/adapter로 느슨하게 붙이고, 성능·취향·안전 기준에 따라 갈아끼운다. 레이어는 유지한다.
- **사람이 고삐 (human-gate)**: 회사 코드를 다루므로 AI에 전권을 주지 않는다. 도구는 제안·보조하고, **실행 결정은 사람이** 내린다.

개념 구조:

```text
oh-my-ai (Shared AI Agent Control Plane / Orchestration Harness)
├─ source of truth: instructions / context docs / skills / safety policy / routing
├─ implemented adapters: Claude Code, Codex
├─ implemented tools: hooks, harness-event, rg/find-based local inspection
└─ optional backend candidates: Jikji, Superpowers, MCP, rsync, other agent runtimes
```

> 설계·결정·현황 전체는 [`docs/harness-design.md`](docs/harness-design.md) (단일 기준점).

## 왜 만들었나

AI coding tool을 쓰다 보면 사용자별 스타일·자주 쓰는 스킬·커맨드, 그리고 **작업 맥락(결정·설계 배경)** 이 쌓인다. 이게 `~/.claude/` 나 한 세션 안에만 있으면:

- 컴퓨터가 여러 대면 매번 세팅 다시 해야 함
- devcontainer 열 때마다 초기화됨
- **세션·머신이 바뀌면 맥락이 날아가 같은 설명을 또 하게 됨**
- 어딘가에서 바꾼 내용이 다른 곳엔 없음

1차 목적은 설정과 맥락을 git으로 한 곳에 모아 **어디서든·언제든 같은 환경 + 컨텍스트**가 유지되게 하는 것.

근데 단순 동기화에서 멈추지 않는다 — **반복 작업을 AI가 감지해 제안하고, 사용자가 컨펌해 커스텀 도구(스킬·커맨드·스크립트·훅)로 쌓는다.** 다른 dotfiles/설정 모음과 달리, **도구를 제안받아 사람이 게이트하며 사용자 워크플로에 맞춰 쌓이는 레이어**다.

## 뭐가 편해지나

| 상황 | 기존 | 이후 |
|------|------|------|
| 새 컴 세팅 | AI별 설정 수동 세팅 | `make doctor`로 충돌 확인 후 `make install-shared` |
| devcontainer | AI별 설정 없음 | VS Code Dotfiles로 자동 적용 |
| 설정 수정 | 머신별로 따로 | 레포에서 수정 → `git push` → 어디서든 `make update` |
| 스킬 추가 | 해당 머신에만 존재 | `git push`하면 다른 머신에도 동기화 |

## 구조

```text
instructions/
  harness.md             ← 공유 표현 원칙·품질 기준·작업 라우팅·자동화 트리거의 원본
  execution-policy.md    ← 파일 수정 방식 선택을 위한 execution mode 정책
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
  settings.json          ← 플러그인 설정 + 훅(SessionStart 주입 / 사용 측정)
  hooks/                 ← 공유 훅 스크립트
  agents/                ← 커스텀 에이전트
scripts/
  render-instructions.sh ← 스킬 메타데이터로 라우팅·MINE·AI별 instruction 생성
  harness-event.mjs      ← 런타임 중립 SkillStart 기록·저장소별 집계
  cascade-check.sh       ← 비스킬 산출물 등록 drift 검사
hooks/
  pre-commit             ← 하네스 원본 변경 시 파생 산출물 자동 재생성
profiles/
  example/PROFILE.md     ← 개인 profile 템플릿
  example/*.example      ← 개인 helper/local hook 예시 템플릿
  local/                 ← 커밋하지 않는 실제 개인 profile/private script 위치
docs/
  harness-design.md      ← 하네스 설계·결정·현황 (단일 기준점)
  devcontainer-workflow.md ← oh-my-ai/심링크 워크플로 상세
```

## 스킬 사용량 조회

공용 로그는 Git에 커밋하지 않고 `${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-ai/harness-usage.log`에 JSONL로 저장한다.

```bash
harness-event report                                      # 현재 Git 저장소
harness-event report --all                                # 전체 저장소
harness-event report --repo github.com/<owner>/oh-my-ai
harness-event report --since-days 30
```

## 설치

### 실제 머신 (심링크 방식)

```bash
git clone https://github.com/<owner>/oh-my-ai.git ~/Github/oh-my-ai
cd ~/Github/oh-my-ai
make install
```

먼저 현재 환경을 점검한다. 이 명령은 읽기 전용이며 기존 스킬·설정·훅을 바꾸지 않는다.

```bash
make doctor
```

공유 core 설치는 opt-in이고 non-destructive다. 기존 `~/.claude/skills`, `~/.agents/skills`, settings, hooks, agents가 있으면 자동으로 덮어쓰지 않고 skip한다. 없는 경로 또는 이미 oh-my-ai가 관리 중인 symlink만 연결한다.

```bash
make install-shared
```

개인 profile은 별도 opt-in이다. 공유 예시는 `profiles/example/`에 두고, 실제 개인 profile은 커밋하지 않는 `profiles/local/<name>/`에 둔다. 기존 스킬과 자동 병합하지 않으므로 충돌 시 수동으로 비교·병합한다.

```bash
make install-profile PROFILE=<name>
```

공유 규칙은 `instructions/harness.md` 또는 `instructions/execution-policy.md`를 수정한 뒤 `make instructions`로 재생성한다. 공유 템플릿 릴리스 기준점은 충돌 방지 정책까지 포함된 `v0.3.0-shared-template` 이후로 본다.

업데이트:

```bash
make update   # git pull + non-destructive shared install
```

## 설치 정책

- shared 설치는 non-destructive다. 기존 스킬·설정·스크립트를 덮어쓰지 않고 `skip`한다.
- `make doctor`는 현재 링크/로컬 파일 상태를 읽기 전용으로 보여준다.
- 개인 profile은 opt-in이다. 실제 profile/private script는 `profiles/local/<name>/`에 두고 커밋하지 않는다.
- profile script를 설치하려면 `make install-profile PROFILE=<name>`을 사용한다. profile hook/settings는 자동 활성화하지 않고 직접 병합한다.

## Execution Mode 선택

기본값은 `patch-with-approval`이다. 전체 정의는 `instructions/execution-policy.md`를 본다.

| Mode | 동작 |
|------|------|
| `suggest-only` | 파일을 직접 수정하지 않고 변경 전/후, diff, patch, 명령어만 제시 |
| `patch-with-approval` | 변경 계획과 diff를 먼저 제시하고 승인 후 수정 |
| `auto-apply` | 명시된 범위 안에서 직접 수정하고 검증 결과와 남은 리스크 보고 |

로컬에서 override하려면 `.env.local` 또는 private profile에 둔다.

```bash
HARNESS_EXECUTION_MODE=patch-with-approval
```

### devcontainer (복사 방식)

VS Code Settings (JSON)에 한 번만 추가:

```json
"dotfiles.repository": "https://github.com/<owner>/oh-my-ai",
"dotfiles.installCommand": "setup.sh"
```

이후 새 devcontainer 뜰 때마다 VS Code가 자동으로 레포 clone + `setup.sh` 실행. 기본 `setup.sh`는 non-destructive shared install이라 기존 `~/.claude/skills`, `~/.agents/skills`, settings, hooks가 있으면 skip하고 안내만 한다.

### devcontainer (심링크 방식)

복사 방식은 스킬/커맨드 수정이 레포에 바로 반영되지 않음. 실제 머신처럼 심링크를 유지하고 싶다면 별도 가이드 참고.

→ [docs/devcontainer-symlink.md](docs/devcontainer-symlink.md)

## Optional workflow skills

일부 born-here 스킬은 shared core가 아니라 특정 업무 도구를 쓰는 사용자를 위한 optional workflow다. 기본 라우팅에는 노출하지 않고, 필요한 사용자가 스킬 이름으로 직접 호출한다.

| Skill | 필요한 context | 용도 |
|------|----------------|------|
| `daily-report` | Slack daily report, optional Notion worklog/Todo | 오늘 한 일을 프로젝트별 진척률과 함께 일일보고로 정리 |
| `worklog-note` | Notion or similar worklog/Todo workspace | 장황한 업무일지·Todo·회의 메모를 스캔 가능하게 정리 |
| `release-note` | Jira fixVersion/release-report, optional Confluence page | Jira 릴리즈 이슈를 사용자 체감 릴리즈 노트로 정리 |

이 스킬들은 삭제하지 않는다. Slack/Notion/Jira/Confluence를 쓰지 않는 사용자에게 기본값처럼 보이지 않도록 `metadata.route`만 제거한다.

## 스킬/커맨드/에이전트 추가

커스텀 스킬은 `SKILL.md` frontmatter에 `source`, `summary`, 필요시 `route`를 한 번만 작성한다. `make instructions`가 라우팅 표와 `MINE.md`를 생성한다.

기존 `~/.claude/skills`나 `~/.agents/skills`가 있으면 자동 병합하지 않는다. shared skills를 쓰려면 `make doctor` 결과를 보고 직접 백업·병합·symlink 여부를 결정한다. 커밋·푸시 전 현재 `remote`, `branch`, `author`, GitHub 인증 계정을 확인한다. 특정 계정 전환 스크립트나 push guard가 필요하면 `profiles/local/` 아래 개인 profile 또는 레포 밖 private script로 분리해서 운영한다.
