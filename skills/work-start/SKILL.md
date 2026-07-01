---
name: work-start
description: "Use when a user invokes /work-start or says they want to start, plan, or kick off a task — to classify the task, recover missing external context (tickets, docs, meeting notes, Slack excerpts, PRs), gather repo context, produce an intermediate checkpoint, and confirm the plan before any code edit, doc write, or external action."
metadata:
  source: born-here
  summary: 작업 시작 시 외부 맥락 회수 → repo 컨텍스트 수집 → 중간 점검 → 컨펌의 conversation-native 플레이북
---

# Work Start — 작업 시작 플레이북

## 목적

작업을 시작할 때 가장 자주 발생하는 실패 원인은 **외부 맥락 누락**이다.

- 기존 티켓이 있는데 안 넣음 → 요구사항 누락
- 회의 결정이 있는데 안 넣음 → 이미 결정난 걸 다시 고민
- Slack 대화가 있는데 안 넣음 → 암묵적 제약 누락
- 기존 PR/이슈가 있는데 안 봄 → 같은 문제 반복

이 스킬은 repo 검색 전에 **먼저 사용자가 빠뜨린 외부 맥락을 회수**한다. 그 다음에 repo/docs/code를 본다.

## 트리거 예시

```
/work-start dual write 고민중인데 네카라 시니어 실무표준 어케 설계해야할까
/work-start 하네스 만든거 노션에 정리하고 싶어
/work-start auth middleware 새 compliance 요구사항에 맞게 수정
/work-start 이번 sprint 배포 전 체크리스트 정리
```

---

## v1 범위

| v1 IN | v1 OUT |
|-------|--------|
| Task classification | workflow preset 실행 |
| External context intake | review lens chain 실행 |
| Repo context gathering | multi-tool routing 실행 |
| Intermediate checkpoint | agent 자동 실행 |
| Confirmation protocol | ohmy CLI |
| Notion/Slack MCP 핸들링 (승인 후) | 외부 API 자동 호출 |
| Safety rules | cloud/API integration |
| context-manifest.yaml 생성 (hint 포함) | workflow preset / lens / tools 실행 |

`workflow_hint`와 `external_context`는 v1에서 **기록/힌트 전용**이다. 실행하지 않는다.

---

## 핵심 규칙

**Never jump directly into implementation or final advice if the task may depend on missing external context.**

외부 맥락이 필요할 수 있는 작업이면, repo를 보기 전에 먼저 외부 맥락 확인 질문을 한다.

---

## 1단계: Task Classification

작업을 분류해 이후 흐름을 결정한다.

| task_type | 예시 | 외부 맥락 질문 |
|-----------|------|---------------|
| `architecture_design` | dual-write 설계, 서비스 분리 | **필수** |
| `migration` | DB migration, infra cutover | **필수** |
| `documentation` | Notion 정리, 설계 문서 작성 | **필수** |
| `review` | PR 점검, 코드 리뷰 | **필수** |
| `handoff` | 인수인계, 세션 전환 | **필수** |
| `debugging` | 에러 분석, 재현 | 있으면 요청 |
| `code_change` | 기능 추가, 버그 수정 | 간단히 확인 |
| `refactor` | repo 내부 리팩터링 | 생략 가능 |
| `general` | 위 분류에 해당 없는 작업 | 간단히 확인 |

분류 결과를 첫 응답에 명시한다. 예: "이건 `documentation` 작업으로 분류됩니다."

---

## 2단계: External Context Intake

### 질문 형식

외부 맥락 질문이 필요한 task_type이면, **repo를 읽기 전에** 아래를 먼저 묻는다.

```
이 작업과 관련된 기존 자료가 있나요?

- Jira / GitHub 이슈 / 티켓
- Confluence / Notion 페이지
- Slack / 메신저 대화 발췌
- 회의록 / 회의 메모
- PR / 이슈 번호
- 제품 결정 / 요구사항 문서
- 작업 지시 텍스트

있다면 아래 중 편한 방식으로 주세요:
1. 직접 복붙
2. 로컬 파일 경로 (make work-start TASK_FILE=<path>)
3. Confluence / Notion / MCP로 접근 가능한 위치 알려주기
4. 없으면 "없음"

없어도 진행 가능하지만, 기존 결정사항이나 제약이 빠질 수 있습니다.
```

### 입력 형식 (accepted source forms)

| 입력 형태 | 처리 |
|-----------|------|
| 복붙 텍스트 | 그대로 외부 맥락으로 취급 |
| 로컬 파일 경로 (`.md`, `.txt`) | `make work-start TASK_FILE=<path>` 안내 또는 직접 읽기 |
| MCP/connector reference | 가능하면 사용 (Notion MCP, Confluence MCP 등) |
| URL | 직접 접근 가능한 경우 fetch, 아니면 복붙 요청 |
| "없음" | repo-local context로 진행, 외부 맥락 missing으로 표기 |

### "없음" 처리

```
외부 자료가 없으면 repo 기준으로 진행합니다.
단, 기존 결정사항·제약·팀 운영 규칙이 빠질 수 있습니다.
작업 중 발견되는 context gap은 중간 점검에서 명시합니다.
```

### Notion / Confluence / Jira / Slack 처리

- **API/connector 가용 여부를 먼저 확인한다.** 자동으로 가정하지 않는다.
- Notion MCP, Confluence MCP가 세션에서 사용 가능하면 사용자 승인 후 사용한다.
- 가용하지 않으면 복붙 또는 로컬 파일로 요청한다.
- Slack export, Jira API는 사용자가 직접 연결한 경우에만 사용한다.

---

## 3단계: Repo Context Gathering

외부 맥락 수집이 끝난 뒤 repo를 본다.

수집 순서:

1. `git log --oneline -10` — 최근 작업 흐름
2. `git status --short` — 현재 worktree 상태
3. `git tag --sort=-version:refname | head -10` — 버전/릴리즈 히스토리
4. `docs/context/`, `CLAUDE.md`, `AGENTS.md`, `README` — 프로젝트 지침
5. `skills/` 목록 — 적용 가능한 플레이북
6. task와 관련된 파일 탐색 (`rg`, `find`)
7. 필요 시 `make work-start TASK="..."` helper 실행 (candidate 수집 보조)

### helper script와의 관계

`scripts/work-start.sh` (`make work-start`)는 repo candidate 수집 보조 도구다.  
이 스킬의 핵심 UX는 conversation 내 AI가 직접 담당한다. script는 선택적 보조 수단이다.

---

## 4단계: Intermediate Checkpoint

repo context 수집 후, **액션 전에** 중간 점검을 보고한다.

형식:

```
## 중간 점검

### 확인된 내용
- <git log, PR, 관련 파일에서 파악한 사실>

### 빠진 외부 맥락
- <없다고 한 항목 / 확보 못 한 항목>

### 작업 유형
- task_type: <분류>

### 후보 방향
- <진행 방향 후보 1~2개, candidate로 표기>

### 식별된 리스크
- <data, security, rollback, compatibility, scope 관련>

이 방향으로 진행해도 괜찮으신가요?
```

---

## 5단계: Confirmation Protocol

중간 점검 이후 사용자가 컨펌하면 진행한다.

컨펌이 필요한 액션:

| 액션 | 컨펌 필요 |
|------|----------|
| 코드 파일 수정 | 필수 |
| 문서 작성 / Notion 업데이트 | 필수 |
| PR 생성 / 커밋 | 필수 |
| 외부 서비스 API 호출 | 필수 |
| git push | 필수 |

컨펌 없이 진행하지 않는다.

---

## 안전 경계

- 코드 자동 수정 금지 — 계획을 먼저 보여주고 컨펌 후 수정한다.
- `docs/strategy/`, `docs/internal/`, `docs/roadmap-private/`, `profiles/local/` 내용을 출력하거나 타 서비스로 전송하지 않는다.
- 검색 결과(candidate)를 사실(fact)로 단정하지 않는다. 항상 "후보"로 표기한다.
- 외부 MCP/API는 사용자 승인 없이 호출하지 않는다.
- secret, token, 개인 경로를 외부 서비스에 전송하지 않는다.
- Notion, Confluence, Slack, Jira 자동 write는 명시적 컨펌 후에만 한다.

---

## v2 호환 — Manifest Hint Fields

`make work-start`가 생성하는 `context-manifest.yaml`에는 v2 호환용 빈 필드가 포함된다.
**v1에서는 이 필드를 읽기만 하고 실행하지 않는다.**

```yaml
workflow_hint:
  preset: <task_type 기반 keyword 추론 — hint only>
  lenses: []          # v1에서 항상 빈 배열
  tools: []           # v1에서 항상 빈 배열
  note: "Hint only. Not executed in v1."

external_context:
  status: missing | partial | provided
  sources: []         # 사용자가 제공한 경우에만 채워짐
  note: "External context is user-provided only in v1."
```

`preset` 추론 규칙 (keyword 기반, v1):

| keyword | preset |
|---------|--------|
| migration, cutover, dual-write | migration |
| debug, bug, fix, error, crash | bugfix |
| refactor, cleanup, restructure | refactor |
| review, pull request | review |
| doc, notion, confluence, readme, 정리 | documentation |
| handoff, 인수인계 | handoff |
| design, architect, 설계 | architecture_design |
| (기타) | general |

v2에서는 이 필드에 preset 실행, lens 체인, tool routing이 붙는다.

---

## UX 예시

### 예시 1: architecture/design

```
사용자: /work-start dual write 고민중인데 네카라 시니어 실무표준 어케 설계해야할까

AI: 이건 architecture_design 작업으로 분류됩니다.

바로 설계 방향을 드리기 전에 먼저 확인할 게 있습니다.
이 작업과 관련된 기존 자료가 있나요?
- 기존 티켓 / GitHub 이슈
- Confluence / Notion 설계 문서
- 팀 Slack 대화나 회의 결정
- 기존 PR / ADR
- 현재 DB 스키마나 migration plan

있다면 복붙, 파일 경로, 또는 MCP 위치로 주세요. 없으면 "없음"이라고 말씀해주세요.
없어도 진행 가능하지만, 팀이 이미 결정한 제약이나 기존 migration 이력이 빠질 수 있습니다.
```

### 예시 2: documentation

```
사용자: /work-start 하네스 만든거 노션에 정리하고 싶어

AI: 이건 documentation 작업으로 분류됩니다.

정리 기준이 될 외부 자료가 있나요?
- 기존 Notion 페이지 (정리하려는 대상 페이지)
- 희망하는 문서 구조 / 형식
- 회의 메모나 공유한 roadmap 문서
- PR 목록이나 release 기준

있다면 복붙, 파일 경로, 또는 Notion MCP 위치로 주세요. 없으면 "없음"이라고 말씀해주세요.
없으면 repo의 git log, PR 흐름, skills 목록, README 기준으로 초안을 만들겠습니다.
```

```
사용자: 없음

AI: repo 기준으로 진행합니다. 외부 자료가 없으므로 이미 결정된 제약이나 팀 기준이 빠질 수 있습니다.

[git log, PR 목록, skills 목록 확인 후]

## 중간 점검

### 확인된 진행 내역
- v0.5 profile onboarding
- v0.5.1 telemetry fallback
- v0.6 SearchBackend boundary 정리
- internal planning doc guardrail
- private profile skill doctor 안내
- v0.7.1 work-start local MVP

### 빠진 외부 맥락
- 기존 Notion 페이지 구조 미확인
- 정리 형식 / 대상 독자 미확인

### 후보 방향
- 버전/마일스톤 단위 타임라인 구조
- 스킬/커맨드/훅/인프라 레이어별 구조

### 식별된 리스크
- Notion MCP 가용 여부 미확인

어떤 구조로 정리할지, Notion MCP가 연결되어 있는지 확인 후 진행하겠습니다.
```
