---
name: handoff-prompt
description: Use when ending a session, switching AI tools, or creating a PR — to generate a structured handoff prompt that the next AI session can use as context. Covers branch state, completed work, do-not-touch constraints, verification results, and next actions. Does NOT capture raw logs or auto-summarize conversation.
metadata:
  source: born-here
  summary: 세션 전환 시 다음 AI 세션에 붙여넣을 handoff prompt를 사람이 직접 작성하도록 안내
  routing:
    visibility: contextual
    risk_level: medium
    task_types:
      - handoff
      - session-transfer
    triggers:
      - kind: keyword
        values:
          - 핸드오프
          - 인수인계
          - 새 세션
          - 넘겨줘
          - handoff
      - kind: intent
        values:
          - prepare_next_session_context
    keywords:
      ko:
        - 핸드오프
        - 인수인계
        - 넘겨
        - 새 세션
      en:
        - handoff
        - transfer
        - next session
    use_when:
      - 세션 종료나 AI 도구 전환 전에 다음 세션이 이어받을 수 있는 짧은 export prompt가 필요한 경우
    do_not_use_when:
      - 장기 보존할 설계 맥락을 docs/context에 축적해야 하는 경우
    requires:
      - current_repo_state
---

# Handoff Prompt — Structured Handoff Candidate

## 이 스킬의 범위

이 스킬은 세션이 끝나거나 Worker Session에 작업을 넘길 때 **provider-neutral Structured Handoff Candidate**를 사람이 직접 작성하도록 안내한다.

Structured Handoff Candidate는 Worker에게 전달할 작업 계약 후보이며, Human Review 전에는 승인된 작업이나 실행 허가가 아니다.

- raw log 읽기 금지
- transcript_path 읽기 금지
- 자동 summary 생성 금지
- hook, script, make target 없음
- 자동 `docs/context` 승격 없음
- Runtime 자동 실행 없음
- Worker 자동 생성 없음
- Session Linking 없음
- 자동 Result 반환 없음

**입력**: Work-start 후보, Project Context, 현재 repo 상태, 사람이 확인한 결정·제약·검증 요구
**출력**: Worker Session에 수동 Copy/Paste 가능한 Structured Handoff Candidate Markdown

---

## project-context와의 차이

| 항목 | `handoff-prompt` | `project-context` |
|------|-----------------|-------------------|
| 목적 | Structured Handoff Candidate — 현재 Task를 다음 Worker Session에 전달하는 단기 실행 계약 | CONTEXT CHECKPOINT — 장기적이고 Human-confirmed인 Project Context 갱신 |
| 저장 위치 | 기본 미저장. 필요 시 local-only 임시 파일 | `docs/context/*` (Git tracking 가능) |
| 입력 | Work-start 후보 + 현재 repo 상태 + 사람이 확인한 제약/결정 | human-confirmed 설계 배경, 장기 보존 맥락 |
| Git tracking | 금지 | curated 내용만 가능 |
| 수명 | 해당 Worker 작업 종료 후 폐기 | 장기 유지 |

### Project Context Preflight

Structured Handoff Candidate를 만들기 전에 Durable Context의 존재와 최신성을 확인한다.

- 최신 Durable Context가 존재하면 해당 Context와 현재 Task 상태를 사용해 Candidate를 생성한다.
- Durable Context가 없으면 기존 `project-context` CREATE 흐름을 먼저 수행하고, 사용자 확인 후 Context를 저장한 다음 Candidate를 생성한다.
- Durable Context가 현재 작업보다 오래됐으면 기존 `project-context` UPDATE 흐름을 먼저 수행하고, 사용자 확인 후 최신 Context를 반영한 다음 Candidate를 생성한다.

이 연결은 기존 `project-context` CREATE/UPDATE → `handoff-prompt` 책임 순서만 정의한다. Structured Handoff Candidate를 `docs/context/*`에 저장하거나 자동 Promotion하지 않는다.

## conversation-capture와의 차이

`conversation-capture`는 raw event 관측 계층이다. raw log를 생성하고 redacted candidate를 만든다.  
`handoff-prompt`는 그 candidate를 사람이 검토·확인한 뒤에 쓰는 export 단계다.

**흐름**: `conversation-capture` → raw log → human review → confirmed → `handoff-prompt` export

---

## 안전 경계 (항상 준수)

- raw log 원문을 handoff prompt에 포함하지 않는다
- tool output 원문을 장기 복사하지 않는다
- secret / token / 개인 경로를 포함하지 않는다
- 자동 summary를 사실로 단정하지 않는다
- 민감 정보가 포함된 prompt를 다른 AI 세션에 전달하지 않는다
- next session에 raw log를 자동 주입하지 않는다
- Structured Handoff Candidate를 승인 완료 상태로 쓰지 않는다
- Handoff 생성과 Runtime 실행을 분리한다
- 검증하지 못한 항목을 충족한 것으로 쓰지 않는다

---

## Handoff Prompt 작성 절차

### 1. Project Context Preflight와 현재 repo 상태 수집

위 Preflight에 따라 Durable Context를 확인한 뒤 CLI로 현재 상태를 직접 확인한다.

```bash
oh-my-ai context-checkpoint handoff-preflight
git remote -v         # remote 확인 (credential 제거)
git branch            # 현재 브랜치
git status            # worktree 상태
git log --oneline -3  # 최근 커밋
gh pr list            # 열린 PR 목록
```

Context Checkpoint 결과는 advisory다.

- `clean`: 기존 Handoff 흐름을 계속한다.
- `review_needed`: 사용자에게 Context Checkpoint 진행, `no_update` 확인, unresolved 상태로
  Manual Handoff 계속 중 하나를 직접 선택하게 한다. 기본 선택은 없다.
- `unavailable`: Handoff를 차단하지 않고 Manual Context Checkpoint 검토가 필요함을 표시한다.

사용자가 unresolved 상태로 계속하면 Candidate에 다음 canonical 동등 표현을 반드시 남긴다.

```text
Context checkpoint: review_needed / unresolved
```

`review_needed` 또는 `unavailable`을 Context 최신·Review 완료로 표현하지 않는다.
`no_update`는 사용자가 직접 확인한 뒤 다음 명령으로만 해결한다.

```bash
oh-my-ai context-checkpoint resolve no-update
```

### 2. 사람이 직접 확인해야 할 항목

아래를 CLI 결과나 직접 판단으로 채운다. **자동 summary가 아니라 사람이 인지하고 있는 사실만 써야 한다.**

- Worker가 달성해야 할 단일 Goal
- Scope와 Scope 밖 대상
- allowed_actions / prohibited_actions / do_not_touch
- 중요한 결정과 이유
- confirmed_facts / confirmed_decisions / assumptions / open_issues
- 필요한 validation_required와 실행할 수 없는 검증의 보고 방식
- expected_output과 completion_criteria
- Result Basic 반환 형식

### 3. 템플릿 채우기

아래 템플릿을 복사해서 채운다. 빈 항목은 `(없음)` 또는 `N/A`로 표시한다.
사용자가 검토·수정한 뒤 Worker Session에 수동 Copy/Paste한다.

---

## Structured Handoff Candidate 템플릿

```markdown
# Structured Handoff Candidate

## Candidate Boundary
- This is a provider-neutral Markdown Candidate.
- Human Review is required before copy/paste to a Worker Session.
- This is not an approved task, Action Approval, Runtime command, Runtime Invocation, Worker auto-creation, Session Linking, Managed Task, or automatic Result return.

## Contract Metadata
- schema_version: "1.0"
- artifact_version: 1
- handoff_ref: <handoff-YYYYMMDD-HHMMSS-short-slug>
- lifecycle_status: draft
- review_state: not_reviewed
- created_at: <YYYY-MM-DDTHH:MM:SSZ>

## Goal
- <Worker가 달성해야 할 단일 목적. 기능 목록보다 작업 결과 중심으로 작성>

## Scope
- repository: <owner/repo 또는 local path>
- branch: <branch>
- in_scope:
  - <수정하거나 분석할 디렉터리/파일/기능>
- out_of_scope:
  - <이번 작업에서 다루지 않을 디렉터리/파일/기능>

## Allowed Actions
- <허용된 읽기/수정/검증/보고 행동>
- <예: inspect files, edit files in scope, run listed validation commands>

## Prohibited Actions
- <금지 행동>
- <예: edit generated files directly, run deployment, create commits, push, merge>

## Do Not Touch
- <수정 금지 파일/브랜치/stash/profile/private path>
- <범위 밖 Repository나 기능>

## Confirmed Facts
- <확인된 사실과 source>
- <없으면 N/A>

## Confirmed Decisions
- <이미 결정된 내용과 이유>
- <없으면 N/A>

## Assumptions
- <확인되지 않은 전제>
- <없으면 N/A>

## Open Issues
- <미해결 질문/차단점>
- <없으면 N/A>

## Constraints
- <보안, 개인정보, 생성물, 문서 추적, execution policy 등 제약>
- <없으면 N/A>

## Expected Output
- <작업 완료 시 기대하는 산출물>
- <사용자가 확인해야 할 결과>

## Completion Criteria
- <완료 판정 기준>

## Validation Required
- <수행해야 할 검증 명령 또는 수동 검수>
- If validation cannot be performed, report it under `Validation Not Performed` in Result Basic. Do not mark unperformed validation as passed.

## Repository Context
- work_start_candidates:
  - <Work-start candidate artifact/path, if available>
- project_context:
  - <docs/context path or decision reference, if available>
- related_files:
  - <reference file/path>

## Return Contract
- Return results using `templates/result-basic.md`.
- Preserve all required Result Basic headings.
- Separate `Validation Performed` and `Validation Not Performed`.
- Report `Scope Deviations` explicitly.
- Do not hide `Remaining Risks`.
- Result Basic is an Evidence Candidate until Human Review; it is not automatic completion proof, Apply permission, Merge permission, or Context Promotion permission.
```

---

## 작성 후 체크리스트

- [ ] raw log 원문이 들어가 있지 않은가
- [ ] secret / token / 개인 경로가 포함돼 있지 않은가
- [ ] 자동 summary가 아니라 사람이 확인한 사실만 담겨 있는가
- [ ] Goal / Scope / Do Not Touch가 명시돼 있는가
- [ ] allowed_actions와 prohibited_actions가 분리돼 있는가
- [ ] confirmed_facts와 assumptions가 분리돼 있는가
- [ ] validation_required가 있고, 미수행 검증 보고 방식이 명시돼 있는가
- [ ] expected_output과 completion_criteria가 명시돼 있는가
- [ ] repository_context에 Work-start 후보나 Project Context 참조가 필요한 만큼 들어가 있는가
- [ ] Return Contract가 `templates/result-basic.md`를 참조하는가
- [ ] Candidate가 승인 완료, Runtime 실행, Managed Task로 표현되지 않았는가

---

## 저장 여부

**기본: 저장하지 않는다.** 붙여넣고 세션 시작 후 폐기한다.

저장이 필요하면:
- local-only 임시 경로 (`~/.local/state/oh-my-ai/handoff-prompt-<date>.md`)
- Git tracking 금지
- 민감 정보 포함 여부 재확인 후 저장

`docs/context/`에 그대로 저장하지 않는다. `docs/context/`는 human-confirmed 장기 맥락 전용이다.
