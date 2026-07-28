---
name: jira-ticket
description: "Optional Jira planning skill for drafting and validating a single Ticket Contract or an Epic-and-child backlog preview from explicit user requests or supplied specifications. Use for clear requests to prepare Jira tickets or break a specification into a Jira backlog. Preview only: do not create Jira issues, call Atlassian or Confluence, create Git branches, or start implementation."
metadata:
  source: born-here
  summary: Jira 생성 전 Source·Ticket Contract·Backlog Preview를 검증하는 optional planning workflow
  routing:
    visibility: optional
    risk_level: medium
    task_types:
      - jira_ticket_planning
      - jira_backlog_planning
    triggers:
      - kind: keyword
        values:
          - jira ticket
          - jira backlog
          - Jira 티켓
          - Jira 백로그
          - Confluence 명세
      - kind: intent
        values:
          - plan_jira_ticket
          - plan_jira_backlog
    keywords:
      ko:
        - Jira 티켓
        - Jira 백로그
        - 티켓으로 정리
      en:
        - jira ticket
        - jira backlog
        - ticket preview
    use_when:
      - 명시적으로 Jira Ticket Preview 또는 Jira Backlog 분해를 요청한 경우
    do_not_use_when:
      - Jira 연동 방식 설명, 가능성 상담, 또는 실제 Jira Write만 요구한 경우
    requires:
      - explicit_jira_planning_intent
---

# Jira Ticket Preview

이 스킬은 선택적 integration planning workflow다. `make install-shared` 자동
설치 대상이 아니며 Atlassian Connector는 Core 필수 의존성이 아니다. 특정
workspace, project, Cloud ID, account ID, credential를 사용하거나 기록하지
않는다.

시작 시 사용 로그만 best-effort로 남긴다.

```bash
"$HOME/.local/bin/harness-event" emit skill-start --skill jira-ticket --runtime "${HARNESS_RUNTIME:-codex}"
```

## Intent boundary

다음처럼 Jira 작업을 **계획·정리**하라는 명확한 의도가 있을 때만 Preview를
작성한다.

```text
$jira-ticket Finance Backend Foundation 작업
$jira-ticket <Confluence URL 또는 제공된 명세>
Jira 티켓 만들어줘
이 작업을 Jira에 등록할 수 있게 정리해줘
이 Confluence 명세를 Jira Backlog로 나눠줘
```

다음은 실행 동의가 아니다. 설명·추천 또는 suggestion-only로 답하고 Preview와
External Write 없이 종료한다.

```text
Jira 티켓으로 만드는 게 나을까?
나중에 Jira에 넣을 수도 있다
Jira 연동 방식 설명해줘
jira-ticket은 뭐야?
```

자연어에 `Jira`가 있다는 이유만으로 Preview를 만들지 않는다.

## Non-negotiable boundary

이 PR의 `jira-ticket`은 Pure Contract와 Preview만 제공한다.

- Jira, Atlassian Connector, Confluence Connector, 또는 외부 API를 호출하지
  않는다.
- Jira Issue, Epic, parent link, comment, transition, key, URL을 생성하거나
  성공했다고 주장하지 않는다.
- branch, code, commit, push, PR, `jira-work`, shared preflight를 실행하지
  않는다.
- Local Artifact를 기본 생성하지 않는다. 사용자가 저장을 명시적으로 요청하면
  `.oh-my-ai/jira/ticket-plan-<timestamp>.md` 후보 경로만 안내한다.
- token, credential, secret, Cloud ID, account ID, raw transcript, raw tool
  output, Confluence 전문을 Artifact 또는 Preview에 기록하지 않는다.

## Source of Truth gate

Ticket Authoring에는 기존 Jira Ticket이 없다. 아래 순서로 Source를 읽고
Preview의 `Source of Truth`에 reference와 확인 상태를 적는다.

1. Accepted Decision
2. Canonical Repository Product and Architecture Documents
3. Confluence Specification
4. Explicit User Request
5. Handoff Candidate
6. Current Conversation

Handoff Candidate와 Current Conversation은 Durable Fact가 아니다. 하위
Source가 상위 Source와 충돌하면 멈추고 `Decision Required`를 표시한다. 읽거나
확인하지 못한 Source는 `Not Verifiable`이며, URL만으로 검증됐다고 주장하지
않는다.

Confluence URL만 제공되고 명세 본문이 없으면 Connector를 호출하지 않는다.
`Not Verifiable`로 표시하고 사용자가 본문을 제공하거나 후속 Connector
Integration을 사용하도록 안내한다. 내용을 추측해 Contract를 완성하지 않는다.

## Preview workflow

1. Intent가 명확한지 판정한다. 모호하면 suggestion-only로 끝낸다.
2. 사용자가 제공한 durable Source와 reference를 확인하고 Source status를
   기록한다.
3. 작은 독립 작업이면 `templates/ticket-contract.md`로 Single Ticket Preview를
   작성한다. 큰 명세면 `templates/backlog-preview.md`로 Epic Candidate와 3–10개
   Child Ticket Candidate를 작성한다.
4. Contract Validation을 실행한다. 실패하면 Blocked Preview를 출력하고 승인
   질문을 표시하지 않는다.
5. 검증된 Source와 완전한 Contract일 때만 `이 구성으로 Jira에 생성할까요?`를
   표시한다.
6. 사용자가 승인해도 conversation에 approval만 기록한다. `External Write Status: Unavailable in this implementation phase`를 보고하고 종료한다.

Jira Write Integration은 후속 PR의 책임이다. 이 단계에서 가상의 Issue Key나
Jira URL을 만들지 않는다.

## Common Ticket Contract and validation

Single Ticket은 아래 14개 필드를 모두 사용한다. 각 필드의 목적과 작성 규칙은
`templates/ticket-contract.md`에 따른다.

```text
Summary
Context
Goal
Source of Truth
In Scope
Out of Scope
Acceptance Criteria
Repository
Base Branch
Expected Branch Name
Dependencies
Verification
Do Not Touch
Definition of Done
```

다음 Blocking Sentinel은 Contract Validation Failure다.

```text
Decision Required
Repository Required
Base Branch Required
Not Verifiable
```

다음도 Validation Failure다.

- required field 누락, 빈 문자열, whitespace-only 값
- unresolved 또는 unknown placeholder
- 필드 간 상호 모순 또는 Source of Truth 충돌
- Repository와 Base Branch 충돌
- In Scope와 Out of Scope 충돌
- Acceptance Criteria와 Verification 충돌

Validation Failure가 있으면 완성된 실행 가능 Ticket으로 표시하지 않는다.
Jira 생성 승인 단계로 진행하지 않고, 누락·모순·결정 필요 항목을 명시한 뒤
종료한다. 미래 Write Integration도 이 Hard Stop을 우회하면 안 된다.

## Ticket shape

### Single Ticket mode

작고 독립적인 작업은 하나의 Ticket Candidate로 만든다. Preview에는 Issue Type
Candidate, Summary, 14개 Contract 필드, Validation Result, Blocking Items,
Expected Branch Name Candidate, Source References를 포함한다.

Issue Type은 Jira metadata가 아닌 semantic candidate다.

| Candidate | Use when |
|---|---|
| Feature | 사용자에게 보이는 큰 기능 |
| Story | 사용자 가치와 사용자 흐름 |
| Task | backend, infra, 문서, 테스트, 설정 작업 |
| Bug | 기존 동작 결함 |
| Research | 구현 전 조사·검증 |
| Tech Debt | refactoring, 구조, 보안 부채 |

유형을 판단할 수 없으면 임의로 `Task`를 고르지 말고 `Issue Type Decision
Required`를 표시한다. 실제 Project Issue Type metadata 확인은 후속 Write
Integration의 책임이다.

### Backlog mode

큰 명세는 Epic Candidate 하나와 3–10개 Child Ticket Candidate로 나눈다.
실제 Jira Epic, Parent Link, Jira Sub-task는 만들지 않는다. logical parent와
dependency candidate만 Preview에 기록한다.

- Repository가 다르면 Ticket을 분리한다.
- 한 Ticket은 한 Repository, 독립 Branch 하나, Draft PR 하나로 처리 가능한
  크기여야 한다.
- 선행 dependency와 구현·테스트·문서·infra 책임을 필요할 때 분리한다.
- 과도한 Sub-task 분할을 피하고 Epic Child와 Jira Sub-task를 혼동하지 않는다.

## Expected Branch Name candidate

Preview의 branch name은 생성 명령이 아닌 candidate다. 실제 Jira Key와 branch를
창작하지 않는다.

1. Repository의 강제 naming, protection, base rule을 확인한다.
2. 검증된 `Expected Branch Name`이 강제 rule에 맞으면 사용한다.
3. 없으면 Repository의 일반 convention을 사용한다.
4. 둘 다 없으면 Common Fallback을 사용한다.

Repository 강제 rule을 검증하지 못하면 `Not Verifiable`다. 실제 key가 없으므로
fallback은 다음처럼 `<ISSUE-KEY>`를 보존한다. Korean text를 임의 romanization
하지 않으며 안정적인 slug가 없으면 `<prefix>/<ISSUE-KEY>` 후보를 쓴다.

```text
Feature / Story  -> feat/<ISSUE-KEY>-<slug>
Task             -> chore/<ISSUE-KEY>-<slug>
Bug              -> fix/<ISSUE-KEY>-<slug>
Docs             -> docs/<ISSUE-KEY>-<slug>
Tech Debt        -> refactor/<ISSUE-KEY>-<slug>
Research         -> research/<ISSUE-KEY>-<slug>
```

## Output templates

- `templates/ticket-contract.md`: Single Ticket Preview의 14개 필드와 validation
  boundary.
- `templates/backlog-preview.md`: Source Status, mode, Epic/Child Candidate,
  approval, External Write boundary.

Preview에 secret 또는 raw source를 복사하지 않는다. reference와 필요한 최소
요약만 사용한다.
