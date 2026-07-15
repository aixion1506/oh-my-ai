# oh-my-ai V1/V2 Product Boundary Audit

## 1. Executive Summary

현재 `oh-my-ai`는 `Skill Routing + Runtime Adapter Instruction + Local Context + Human-gated Execution` 하네스로는 상당 부분 구현되어 있다. 하지만 새 제품 정의인 `Main Session -> Worker Task Packet -> Human Review -> Worker Result Packet -> Human Review -> Main Session` 기준으로 보면 핵심 흐름은 아직 구현되지 않았다.

기존 MVP는 "AI별 instruction, skill, context를 관리하는 local harness"에 가깝다. 새 MVP는 "수동 멀티세션 위임/회수 CLI"다. 이 차이 때문에 새 기준 진척률은 45-50%로 보는 것이 맞다.

가장 큰 구조적 gap은 runtime-neutral Packet Contract와 수동 handoff/result UX 부재다. `handoff-prompt`는 세션 전환 프롬프트로는 유효하지만 Worker Task Packet/Result Packet 계약은 아니다.

최우선 다음 작업은 제품 용어와 V1/V2 경계 contract를 source 문서에 고정하는 것이다. 구현보다 먼저 `handoff-prompt`, `project-context`, `work-start`, `packet`의 책임을 분리해야 한다.

## 2. Current State Audit

| 기능 | 관련 파일 | 현재 상태 | V1 필요성 | 판정 |
|---|---|---:|---:|---|
| Runtime adapters | `instructions/adapters/codex.md`, `instructions/adapters/claude.md` | Implemented | 필수 | 유지 |
| Instruction cascade | `scripts/render-instructions.sh`, `hooks/pre-commit` | Implemented | 필수 | 유지 |
| Skill Routing | `scripts/render-skill-index.mjs`, `scripts/prompt-routing-hook.mjs` | Implemented | 중요 | 유지 |
| Work-start | `scripts/work-start.sh`, `skills/work-start/SKILL.md` | Partial | 중요 | Packet seed로 Adapt |
| handoff-prompt | `skills/handoff-prompt/SKILL.md` | Partial | 필수 | Worker Packet으로 재정의 |
| project-context | `skills/project-context/SKILL.md` | Partial | 중요 | 장기 Source of Truth로 유지 |
| conversation-capture | `docs/harness-design.md` | Documented-only | V2 | 이관 |
| Local usage log | `scripts/harness-event.mjs` | Implemented | Nice | 유지 |
| Execution policy | `instructions/execution-policy.md` | Implemented | 필수 | 유지 |
| Task Packet Schema | 없음 | Missing | 필수 | 신규 |
| Result Packet Schema | 없음 | Missing | 필수 | 신규 |
| Handoff CLI create/review/export | 없음 | Missing | 필수 | 신규 |
| Result CLI create/review/import | 없음 | Missing | 필수 | 신규 |
| Packet validation fixtures | 없음 | Missing | 필수 | 신규 |
| Cloud/Auth/Billing | `docs/context/harness-v2-local-remote-execution-contract.md` | Contract-only | V2 | 이관 |

## 3. Product Boundary Review

### V1 Public Local CLI

- Main/Worker role contract
- Task/Result Packet schema
- manual export/import
- local context read
- human review
- skill routing evidence
- XDG usage log

### V2 Private Cloud Control Plane

- session identity resolution
- automatic task linking
- session graph
- approval queue
- managed memory
- runtime broker
- learning loop
- SkillOpt
- billing
- team policy

### Shared Public Contracts

- packet schemas
- adapter contract
- redaction/privacy vocabulary
- source-of-truth rules
- local/remote execution labels

### Runtime Adapters

Claude/Codex adapter는 현재 instruction projection으로 존재한다. Gemini adapter는 없다. Adapter는 generic packet을 runtime별 텍스트로 투영해야 하며, 제품 의미를 소유하면 안 된다.

### Domain Extensions

도메인/프레임워크 스킬은 optional library로 둔다. Core orchestration 의미를 도메인 스킬이 정의하면 안 된다.

### Personal Profiles

계정 정책, private skill, capture preference, local script는 `profiles/local/` 또는 레포 밖 private script에 둔다.

## 4. Main / Worker Contract Review

현재 repo에는 유사 개념은 있지만 Main/Worker Packet contract 자체는 없다.

`handoff-prompt`는 repo state, branch, Do Not Touch, verification, next action을 다룬다. 하지만 Worker 작업 계약에 필요한 `scope`, `allowed_actions`, `prohibited_actions`, `completion_criteria`, Worker status, files read/changed separation, deviations, unresolved risks가 없다.

`work-start`는 local-only candidate artifact를 만들고, search result를 truth가 아니라 candidate로 취급한다. 이 구조는 Task Packet candidate 생성의 좋은 seed다.

### Task Packet Minimum Schema

```text
schema_version
task_id
parent_task_id
created_at
source_session
goal
repository
branch
commit
current_state
facts
confirmed_decisions
assumptions
open_issues
constraints
scope
do_not_touch
allowed_actions
prohibited_actions
expected_output
validation_required
return_format
completion_criteria
```

### Result Packet Minimum Schema

```text
schema_version
task_id
source_worker_session
completed_at
status
what_was_done
findings
evidence
files_read
files_changed
commands_run
validation_results
assumptions
unresolved_risks
deviations_from_scope
recommended_next_action
handoff_notes
```

### Human Review Points

- Task Packet candidate review
- export approval
- Worker Result Packet review
- Main context import approval
- `docs/context` promotion approval

### Source of Truth Boundary

Repo 문서, `docs/context`, ADR이 durable truth다. Task/Result Packet은 transfer artifact다. Worker Result는 Main Session에서 accept/edit/reject되기 전까지 evidence candidate다.

## 5. V1 Scope

### V1 Must Have

- Main/Worker terminology
- generic packet schemas
- manual handoff create/review/export
- manual result create/review/import
- generic Markdown projection
- Claude/Codex projection
- schema validation
- scope/do-not-touch preservation tests
- single-runtime demo

### V1 Nice to Have

- Gemini projection
- TUI review
- local packet export history
- skill routing evidence embedded in packet

### V1 Excluded

- Worker auto-create
- session auto-discovery
- automatic capture
- cloud sync
- memory
- task graph
- runtime broker
- SkillOpt
- automatic context promotion

### V1 Acceptance Scenario

1. One runtime only.
2. Main creates a Worker Task Packet for code investigation.
3. User reviews scope and Do Not Touch.
4. User opens a new session manually.
5. Worker returns Result Packet.
6. User reviews files, commands, validation, risks.
7. Main imports only accepted facts.

### V1 Exit Criteria

- Packet schemas validate.
- Generic manual flow is documented.
- One end-to-end fixture passes.
- Runtime-specific projections preserve meaning.
- Result cannot claim unrun validation.
- `docs/context` is not auto-updated.

## 6. V2 Scope

V2로 넘길 기능:

- Automatic Session Linking
- Session Graph
- Approval Queue
- Session Search
- Managed Memory
- Runtime Broker
- Learning Loop
- SkillOpt
- Cloud/Auth/Billing
- Privacy Modes beyond local manual export

`docs/context/harness-v2-local-remote-execution-contract.md`는 이미 이 방향을 상당 부분 지원한다. Local core는 login 없이 유지하고, remote-protected logic은 서버에 두며, full repo upload는 기본값이 아니어야 한다.

## 7. Adopt / Adapt / Move / Remove

### Adopt as-is

- execution policy
- generated instruction cascade
- non-destructive install
- profile/local separation
- external hook/source policy

### Adapt for Main / Worker

- `handoff-prompt`
- `work-start`
- prompt routing hook
- skill routing evidence

### Move to V2

- conversation-capture implementation
- automatic session capture
- automatic task linking
- managed memory
- hosted registry
- entitlement
- SkillOpt

### Keep as Optional Extension

- domain/framework skills
- local-search/Jikji
- release-note
- daily-report
- worklog-note

### Remove or Deprecate Candidate

Claude <-> Codex 연결을 제품 핵심처럼 보이게 하는 UX나 문구는 후순위 또는 deprecate 후보로 본다. Claude/Codex 조합은 runtime projection 예시일 뿐 V1 대표 데모가 아니다.

## 8. Revised Architecture

현재 파일을 이동하지 않는 전제에서 권장 경계는 다음과 같다.

```text
oh-my-ai
├── Public Local Core
│   ├── instructions/harness.md
│   ├── instructions/execution-policy.md
│   └── setup.sh / Makefile
├── Packet Contracts
│   └── future: specs/packets/*.schema.json or docs/contracts/*
├── Runtime Adapters
│   ├── instructions/adapters/*
│   ├── claude/settings.json
│   └── codex/hooks.json
├── Human Review
│   └── future: scripts/handoff-* and scripts/result-*
├── Local Context / Usage
│   ├── skills/project-context
│   ├── scripts/work-start.sh
│   └── scripts/harness-event.mjs
├── Cloud API Client
│   └── future public thin client only
└── Private Cloud Control Plane
    └── not in this public repo
```

Public CLI에 넣지 말아야 할 것:

- session linking/ranking/resume algorithm
- context selection/ranking algorithm
- Worker result acceptability scoring
- failure mining to Skill candidate logic
- SkillOpt promotion criteria
- runtime quality/cost recommendation policy

## 9. Roadmap and PR Plan

### PR 1. Product terminology and boundary contract

목적: 새 V1/V2 정의를 source 문서에 고정한다.

수정 파일 후보:

- `README.md`
- `docs/harness-design.md`
- `instructions/harness.md`

구현 범위:

- Main/Worker role terminology
- V1 manual local CLI boundary
- V2 private cloud boundary
- Claude/Codex 중심 표현 완화

제외 범위:

- CLI 구현
- Packet schema 구현
- Cloud 설계 상세화

검증 항목:

- `make instructions`
- `git diff --check`
- generated file drift 없음

완료 조건:

- 제품 소개가 Skill/Adapter harness에서 Main/Worker control plane으로 정렬된다.
- V1이 단일 Runtime만으로 가능하다는 점이 명확하다.

### PR 2. Main / Worker packet schemas

목적: Task/Result Packet 최소 schema와 예제를 정의한다.

수정 파일 후보:

- `docs/contracts/*` 또는 `specs/packets/*`
- `README.md` 참조

구현 범위:

- Task Packet schema
- Result Packet schema
- good/bad examples
- FACT/ASSUMPTION/OPEN ISSUE/DO NOT TOUCH vocabulary

제외 범위:

- CLI UX
- automatic session capture

검증 항목:

- schema validation
- negative fixture

완료 조건:

- Packet이 단순 prompt template이 아니라 검증 가능한 contract가 된다.

### PR 3. Generic manual handoff flow

목적: 기존 `handoff-prompt`와 `work-start`를 Task Packet candidate 생성 흐름으로 재정렬한다.

수정 파일 후보:

- `skills/handoff-prompt/SKILL.md`
- `skills/work-start/SKILL.md`
- `scripts/work-start.sh`

구현 범위:

- generic Task Packet candidate
- human review checklist
- generic Markdown export

제외 범위:

- Worker session 자동 생성
- runtime 자동 선택

검증 항목:

- Do Not Touch preservation
- scope preservation
- candidate label 유지

완료 조건:

- 한 Runtime 안에서 Worker Task Packet을 수동 전달할 수 있다.

### PR 4. Runtime projections

목적: generic packet을 Claude/Codex/Gemini용 export로 투영한다.

수정 파일 후보:

- `instructions/adapters/*`
- future `scripts/handoff-export-*`

구현 범위:

- generic -> Claude
- generic -> Codex
- generic -> Gemini placeholder or contract

제외 범위:

- runtime broker

검증 항목:

- projection round-trip semantic check

완료 조건:

- Runtime을 바꿔도 Packet 의미가 보존된다.

### PR 5. Result return flow

목적: Worker Result Packet create/review/import candidate를 구현한다.

수정 파일 후보:

- future `scripts/result-*`
- docs/contracts examples

구현 범위:

- result candidate creation
- files_read/files_changed separation
- commands_run/validation_results separation
- import review checklist

제외 범위:

- Main context 자동 반영

검증 항목:

- unrun validation cannot be marked pass
- deviation from scope sample

완료 조건:

- Worker Result가 자동 truth가 아니라 review candidate로 남는다.

### PR 6. Fixtures and smoke tests

목적: V1 acceptance를 고정한다.

수정 파일 후보:

- future `tests/fixtures/*`
- `scripts/*-verify.*`
- `Makefile`

구현 범위:

- schema validation
- scope/do-not-touch preservation
- result truthfulness
- instruction cascade smoke

제외 범위:

- cloud integration

검증 항목:

- `make instructions`
- packet fixture verify
- result fixture verify

완료 조건:

- V1 demo가 회귀 테스트 가능한 상태가 된다.

### PR 7. V1 documentation and release cut

목적: V1을 제품 문서와 demo 기준으로 닫는다.

수정 파일 후보:

- `README.md`
- `docs/harness-design.md`
- `version.md`

구현 범위:

- V1 product definition
- V1 non-goals
- single-runtime demo
- release checklist

제외 범위:

- V2 cloud implementation

검증 항목:

- docs consistency
- generated file drift 없음

완료 조건:

- V1이 "무료 로컬 수동 멀티세션 CLI"로 설명 가능하다.

## 10. Risks and Open Decisions

### Packet이 단순 Prompt Template에 머무를 위험

Schema validation과 negative fixture가 없으면 Packet은 다시 prompt template이 된다. PR 2에서 구조화된 contract와 validation을 먼저 닫아야 한다.

### Main / Worker 용어가 Runtime 개념과 충돌할 위험

Runtime의 native agent/subagent 용어와 섞지 말고 role model로 정의해야 한다. Main/Worker는 runtime feature가 아니라 oh-my-ai contract다.

### 사용자 검수 UX가 번거로워지는 문제

V1은 수동이 핵심이지만 모든 로그를 보게 하면 실패한다. review surface는 scope, context, risk, changed files, validation만 보여야 한다.

### V1 기능이 너무 약해 보이는 문제

V1은 "자동화가 적다"가 아니라 "위임과 회수의 신뢰성이 높다"로 데모해야 한다.

### V2 서버 기능이 Public CLI에 과도하게 노출되는 문제

세션 연결, ranking, conflict detection, SkillOpt promotion 기준은 public repo에 상세 알고리즘으로 두지 않는다.

### Cloud Privacy 문제

기본값은 Metadata-only 또는 Reviewed Handoff가 맞다. Full Context는 명시 opt-in이어야 한다.

### 특정 Runtime 종속

현재 Claude hook이 Codex보다 풍부하다. Generic Packet Projection을 먼저 만들지 않으면 Claude 중심 제품처럼 보일 수 있다.

### Source of Truth 중복

`docs/context`는 durable truth, Packet은 transfer artifact로 고정한다. Packet import가 자동으로 `docs/context`를 수정하면 안 된다.

### Context Drift

Packet은 생성 시점의 repo/branch/commit을 포함해야 한다. Import 시점의 repo state와 다르면 warning이 필요하다.

### Worker Result를 과신하는 문제

Worker Result는 evidence candidate다. Main Session 반영 전 Accept/Edit/Reject가 필요하다.

### Skill과 Handoff의 책임 중복

Skill routing은 "어떤 플레이북을 참고했는가"의 evidence다. Packet은 "Worker에게 허용한 일"의 contract다.

## 11. Final Report

| 항목 | 내용 |
|---|---|
| 분석 Branch | `master` |
| 분석 Commit | `40c0250 docs(harness): standardize pull request governance` |
| 파일 수정 여부 | 이 보고서 파일 생성 |
| 새 V1 기준 진척률 | 45-50% |
| V1에 남길 기능 | local install, instruction cascade, runtime adapters, skill routing, work-start seed, handoff-prompt seed, project-context, execution policy, usage log |
| V2로 이관할 기능 | automatic capture/linking/return, session graph/search, approval queue, managed memory, runtime broker, SkillOpt, billing/cloud |
| 가장 먼저 수행할 PR | Product terminology and boundary contract |
| 제품 정의와 현재 repo 충돌 지점 | repo는 아직 Skill/Context/Adapter harness 중심이고, 새 제품 정의의 Main/Worker Packet workflow는 contract와 CLI가 없다. Claude/Codex adapter는 존재하지만 Generic Packet Projection이 없어 runtime-neutral 제품 메시지가 구현으로 닫히지 않았다. |

## 12. Read Evidence

핵심 확인 파일:

- `README.md`
- `docs/harness-design.md`
- `docs/context/harness-v2-local-remote-execution-contract.md`
- `instructions/harness.md`
- `instructions/execution-policy.md`
- `skills/handoff-prompt/SKILL.md`
- `skills/project-context/SKILL.md`
- `skills/work-start/SKILL.md`
- `scripts/work-start.sh`
- `scripts/render-skill-index.mjs`
- `scripts/prompt-routing-hook.mjs`
- `scripts/harness-event.mjs`
- `claude/settings.json`
- `codex/hooks.json`
- `setup.sh`
- `Makefile`

금융 하네스 관련 문서는 이번 제품 경계 분석에서 제외했다.
